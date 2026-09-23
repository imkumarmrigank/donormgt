// Rider app: the pickups assigned to this rider, and a visit recorder that checks
// the phone's GPS against the pickup pin (must be within 100 m) and takes photos.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Camera, CheckCircle2, Clock, Crosshair, MapPin, Navigation, Phone,
  RefreshCw, AlertTriangle, X, ImagePlus,
} from 'lucide-react'
import * as api from '../services/api'
import { fmtDate } from '../utils/helpers'
import { directionsLink, distanceMeters, formatDistance, getCurrentPosition } from '../utils/geo'

const MAX_PHOTO_EDGE = 1600

/** Shrinks a camera photo (often 4–8 MB) to a ~300 KB JPEG before upload. */
async function compressPhoto(file) {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

function address(p) {
  return [p.house || p.houseNo, p.society, p.sector, p.city].filter(Boolean).join(', ')
}

function VisitBadge({ visit }) {
  if (!visit) return null
  const ok = visit.verified
  return (
    <span className={`badge ${ok ? 'badge-success' : 'badge-warning'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
      {visit.outcomeLabel}
    </span>
  )
}

function PickupCard({ pickup, onVisit }) {
  const addr = address(pickup)
  const directions = directionsLink(pickup.geo, addr)
  const closed = pickup.status === 'Completed'
  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{pickup.donorName || 'Donor'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 5 }}>
            <MapPin size={13} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{addr || 'No address'}</span>
          </div>
        </div>
        <span className="badge badge-muted" style={{ whiteSpace: 'nowrap' }}>{pickup.orderId || pickup.id}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12, alignItems: 'center' }}>
        <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Clock size={11} /> {fmtDate(pickup.date)}{pickup.timeSlot ? ` · ${pickup.timeSlot}` : ''}
        </span>
        {pickup.status && pickup.status !== 'Pending' && <span className="badge badge-muted">{pickup.status}</span>}
        {!pickup.geo && <span className="badge badge-warning">No pin</span>}
        <VisitBadge visit={pickup.lastVisit} />
      </div>

      {pickup.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>“{pickup.notes}”</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 8, marginTop: 2 }}>
        <a className="btn btn-outline btn-sm" style={{ justifyContent: 'center' }} href={pickup.mobile ? `tel:${pickup.mobile}` : undefined} aria-disabled={!pickup.mobile}>
          <Phone size={14} /> Call
        </a>
        <a className="btn btn-outline btn-sm" style={{ justifyContent: 'center' }} href={directions || undefined} target="_blank" rel="noreferrer" aria-disabled={!directions}>
          <Navigation size={14} /> Directions
        </a>
        <button className="btn btn-primary btn-sm" style={{ justifyContent: 'center' }} onClick={() => onVisit(pickup)} disabled={closed}>
          <Crosshair size={14} /> {closed ? 'Completed' : 'Record visit'}
        </button>
      </div>
    </div>
  )
}

function VisitSheet({ pickup, outcomes, maxDistance, onClose, onSaved }) {
  const [position, setPosition] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')
  const [outcomeId, setOutcomeId] = useState('')
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(0)
  const [notes, setNotes] = useState('')
  const [farReason, setFarReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const locate = useCallback(async () => {
    setLocating(true); setLocError('')
    try {
      setPosition(await getCurrentPosition())
    } catch (err) {
      setLocError(err.message)
    } finally {
      setLocating(false)
    }
  }, [])

  useEffect(() => { locate() }, [locate])

  const outcome = outcomes.find(o => o.id === outcomeId)
  const distance = position && pickup.geo ? distanceMeters(pickup.geo, position) : null
  const tooFar = distance !== null && distance > maxDistance

  const addPhotos = async (event) => {
    const files = [...(event.target.files || [])].slice(0, 6 - photos.length)
    event.target.value = ''
    for (const file of files) {
      setUploading(n => n + 1)
      try {
        const compressed = await compressPhoto(file)
        const uploaded = await api.uploadFileViaSignedUrl(compressed, { purpose: 'pickup-visit', entityId: pickup.id })
        setPhotos(list => [...list, { storagePath: uploaded.storagePath, url: uploaded.url }])
      } catch (err) {
        setError(err.message || 'Photo upload failed')
      } finally {
        setUploading(n => n - 1)
      }
    }
  }

  const save = async () => {
    setError('')
    if (!position) { setError('Your location is needed. Tap "Refresh location".'); return }
    if (!outcome) { setError('Choose what happened.'); return }
    if (outcome.requiresPhoto && photos.length === 0) { setError(`Add a photo for "${outcome.label}".`); return }
    if (tooFar && !farReason.trim()) { setError(`You are ${formatDistance(distance)} away. Move closer or explain why.`); return }
    setSaving(true)
    try {
      const result = await api.recordRiderVisit(pickup.id, {
        outcomeId,
        position,
        photos,
        notes: notes.trim() || undefined,
        farReason: farReason.trim() || undefined,
      })
      onSaved(result)
    } catch (err) {
      setError(err.message || 'Could not save the visit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" style={{ maxWidth: 480, width: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div style={{ flex: 1 }}>
            <div className="modal-title">Record visit</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{pickup.donorName} · {pickup.orderId || pickup.id}</div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} disabled={saving}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Location check */}
          <div className={`alert-strip ${locError ? 'alert-danger' : !position ? 'alert-info' : !pickup.geo || tooFar ? 'alert-warning' : 'alert-success'}`}
               style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Crosshair size={15} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12.5 }}>
              {locating && 'Getting your location…'}
              {!locating && locError}
              {!locating && !locError && position && !pickup.geo && <>Location captured (±{position.accuracy} m). This pickup has no pin, so the visit will be flagged for the office.</>}
              {!locating && !locError && position && pickup.geo && (
                tooFar
                  ? <>You are <strong>{formatDistance(distance)}</strong> from the pickup. It must be within {maxDistance} m.</>
                  : <>At the pickup location: <strong>{formatDistance(distance)}</strong> away (±{position.accuracy} m). ✓</>
              )}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={locate} disabled={locating}>
              <RefreshCw size={13} /> Refresh location
            </button>
          </div>

          {/* Outcome */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>What happened? <span className="required">*</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {outcomes.map(o => (
                <button key={o.id} type="button" onClick={() => { setOutcomeId(o.id); setError('') }}
                  style={{
                    padding: '9px 14px', borderRadius: 22, fontSize: 13, cursor: 'pointer',
                    border: `1.5px solid ${outcomeId === o.id ? 'var(--primary)' : 'var(--border)'}`,
                    background: outcomeId === o.id ? 'var(--primary-light)' : 'var(--surface)',
                    color: outcomeId === o.id ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: outcomeId === o.id ? 700 : 500,
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photos */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Photos {outcome?.requiresPhoto ? <span className="required">*</span> : <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>}
              <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · products picked up</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {photos.map((p, i) => (
                <div key={p.storagePath} style={{ position: 'relative' }}>
                  <img src={p.url} alt={`Photo ${i + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                  <button type="button" onClick={() => setPhotos(list => list.filter(x => x !== p))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>×</button>
                </div>
              ))}
              {uploading > 0 && (
                <div style={{ width: 72, height: 72, borderRadius: 8, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>Uploading…</div>
              )}
              {photos.length < 6 && (
                <>
                  <label style={{ width: 72, height: 72, borderRadius: 8, border: '1.5px dashed var(--primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer', color: 'var(--primary)', fontSize: 10.5 }}>
                    <Camera size={18} /> Camera
                    <input type="file" accept="image/*" capture="environment" onChange={addPhotos} style={{ display: 'none' }} />
                  </label>
                  <label style={{ width: 72, height: 72, borderRadius: 8, border: '1.5px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10.5 }}>
                    <ImagePlus size={18} /> Gallery
                    <input type="file" accept="image/*" multiple onChange={addPhotos} style={{ display: 'none' }} />
                  </label>
                </>
              )}
            </div>
          </div>

          {tooFar && (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Why are you not at the pickup location? <span className="required">*</span></label>
              <textarea value={farReason} onChange={e => setFarReason(e.target.value)} placeholder="e.g. Donor met me at the society gate" style={{ minHeight: 56 }} />
            </div>
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label>Notes <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything the office should know" style={{ minHeight: 56 }} />
          </div>

          {error && <div className="alert-strip alert-danger" style={{ fontSize: 12.5 }}>⚠ {error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || uploading > 0 || locating}>
            {saving ? 'Saving…' : 'Save visit'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RiderPickups() {
  const [data, setData] = useState(null)
  const [outcomes, setOutcomes] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [pickups, outcomeList] = await Promise.all([
        api.fetchRiderPickups({ force: true }),
        api.fetchRiderOutcomes(),
      ])
      setData(pickups)
      setOutcomes(outcomeList || [])
    } catch (err) {
      setError(err.message || 'Could not load your pickups')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const list = data?.pickups || []
    const today = data?.today
    const open = p => p.status !== 'Completed' && !p.lastVisit
    return [
      { key: 'today', title: 'Today', items: list.filter(p => p.date === today) },
      { key: 'missed', title: 'Missed — still open', items: list.filter(p => p.date < today && open(p)) },
      { key: 'upcoming', title: 'Upcoming', items: list.filter(p => p.date > today) },
    ].filter(g => g.items.length)
  }, [data])

  const onSaved = ({ pickup, visit }) => {
    setData(d => ({ ...d, pickups: d.pickups.map(p => (p.id === pickup.id ? { ...p, ...pickup } : p)) }))
    setActive(null)
    setToast(visit.verified ? `Saved: ${visit.outcomeLabel} ✓ at location` : `Saved: ${visit.outcomeLabel} (flagged for the office)`)
    setTimeout(() => setToast(''), 4000)
  }

  return (
    <div className="page-body" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {data ? `${data.pickups.length} assigned pickup${data.pickups.length === 1 ? '' : 's'}` : ' '}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
      </div>

      {toast && <div className="alert-strip alert-success" style={{ marginBottom: 12 }}>{toast}</div>}
      {error && <div className="alert-strip alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      {loading && !data && <div className="empty-state">Loading your pickups…</div>}

      {data && groups.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><MapPin size={28} /></div>
          No pickups are assigned to you right now.
        </div>
      )}

      {groups.map(group => (
        <div key={group.key} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)', margin: '4px 2px 8px' }}>
            {group.title} · {group.items.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.items.map(p => <PickupCard key={p.id} pickup={p} onVisit={setActive} />)}
          </div>
        </div>
      ))}

      {active && (
        <VisitSheet
          pickup={active}
          outcomes={outcomes}
          maxDistance={data?.maxDistanceMeters || 100}
          onClose={() => setActive(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
