// Office view of rider visits: where each visit was recorded relative to the
// pickup pin, the outcome, photos, and the list of outcomes riders can choose.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, MapPin, Plus, RefreshCw, Save } from 'lucide-react'
import * as api from '../services/api'
import { useRole } from '../context/RoleContext'
import { formatDistance, mapsLink } from '../utils/geo'

const FLAG_LABELS = {
  'too-far': 'Too far',
  'no-pickup-pin': 'No pickup pin',
  'low-accuracy': 'Weak GPS',
}

const STATUS_OPTIONS = ['', 'Pending', 'Postponed', 'Did Not Open Door']

function daysAgo(n) {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function VisitRow({ visit }) {
  const ok = visit.verified
  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `4px solid ${ok ? 'var(--success)' : 'var(--warning)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{visit.donorName || '—'} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>· {visit.orderId}</span></div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{visit.address}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{visit.riderName}</div>
          <div>{new Date(visit.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span className="badge badge-primary">{visit.outcomeLabel}</span>
        {ok
          ? <span className="badge badge-success" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><CheckCircle2 size={11} /> At location · {formatDistance(visit.distanceMeters)}</span>
          : (visit.flags || []).map(flag => (
            <span key={flag} className="badge badge-warning" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <AlertTriangle size={11} /> {FLAG_LABELS[flag] || flag}{flag === 'too-far' ? ` · ${formatDistance(visit.distanceMeters)}` : ''}
            </span>
          ))}
        {visit.position?.accuracy ? <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>GPS ±{visit.position.accuracy} m</span> : null}
        <a href={mapsLink(visit.position)} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'inline-flex', gap: 3, alignItems: 'center' }}>
          <MapPin size={12} /> Rider location <ExternalLink size={10} />
        </a>
        {visit.pickupGeo && (
          <a href={mapsLink(visit.pickupGeo)} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'inline-flex', gap: 3, alignItems: 'center' }}>
            Pickup pin <ExternalLink size={10} />
          </a>
        )}
      </div>

      {visit.farReason && <div style={{ fontSize: 12.5 }}><strong>Reason given:</strong> {visit.farReason}</div>}
      {visit.notes && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>“{visit.notes}”</div>}

      {visit.photos?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {visit.photos.map((photo, i) => (
            <a key={photo.storagePath} href={photo.url} target="_blank" rel="noreferrer">
              <img src={photo.url} alt={`Visit photo ${i + 1}`} loading="lazy" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function OutcomeEditor({ canEdit }) {
  const [rows, setRows] = useState([])
  const [draft, setDraft] = useState({ label: '', requiresPhoto: false, pickupStatus: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => api.fetchVisitOutcomes().then(setRows).catch(err => setError(err.message)), [])
  useEffect(() => { load() }, [load])

  const update = async (row, patch) => {
    setError('')
    try {
      const saved = await api.updateVisitOutcome(row.id, patch)
      setRows(list => list.map(r => (r.id === row.id ? saved : r)))
    } catch (err) { setError(err.message) }
  }

  const add = async () => {
    if (!draft.label.trim()) return
    setBusy(true); setError('')
    try {
      const saved = await api.createVisitOutcome({ ...draft, label: draft.label.trim(), pickupStatus: draft.pickupStatus || null })
      setRows(list => [...list, saved])
      setDraft({ label: '', requiresPhoto: false, pickupStatus: '' })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="card-header"><div className="card-title">Visit outcomes riders can choose</div></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          "Sets pickup status" changes the pickup when a rider picks that outcome. Pickups are marked Completed only through Record Pickup, where weights and value are entered.
        </div>
        {rows.map(row => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) auto auto auto', gap: 10, alignItems: 'center', fontSize: 13, opacity: row.active === false ? 0.55 : 1 }}>
            <span style={{ fontWeight: 600 }}>{row.label}</span>
            <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
              <input type="checkbox" checked={Boolean(row.requiresPhoto)} disabled={!canEdit} onChange={e => update(row, { requiresPhoto: e.target.checked })} /> Photo required
            </label>
            <select value={row.pickupStatus || ''} disabled={!canEdit} onChange={e => update(row, { pickupStatus: e.target.value || null })} style={{ fontSize: 12, padding: '4px 6px' }}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s ? `Sets: ${s}` : 'No status change'}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" disabled={!canEdit} onClick={() => update(row, { active: row.active === false })}>
              {row.active === false ? 'Enable' : 'Disable'}
            </button>
          </div>
        ))}
        {canEdit && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) auto auto auto', gap: 10, alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
            <input value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="New outcome, e.g. Gate closed" style={{ fontSize: 13 }} />
            <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
              <input type="checkbox" checked={draft.requiresPhoto} onChange={e => setDraft(d => ({ ...d, requiresPhoto: e.target.checked }))} /> Photo required
            </label>
            <select value={draft.pickupStatus} onChange={e => setDraft(d => ({ ...d, pickupStatus: e.target.value }))} style={{ fontSize: 12, padding: '4px 6px' }}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s ? `Sets: ${s}` : 'No status change'}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={add} disabled={busy || !draft.label.trim()}><Plus size={13} /> Add</button>
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
      </div>
    </div>
  )
}

export default function RiderVisits() {
  const { role } = useRole()
  const [filters, setFilters] = useState({ dateFrom: daysAgo(7), dateTo: daysAgo(0), riderId: '', flagged: false })
  const [visits, setVisits] = useState([])
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.fetchUsers({ role: 'rider', limit: 500 }).then(list => setRiders(Array.isArray(list) ? list : [])).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      setVisits(await api.fetchVisits({
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        riderId: filters.riderId || undefined,
        flagged: filters.flagged ? 'true' : undefined,
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const summary = useMemo(() => ({
    total: visits.length,
    verified: visits.filter(v => v.verified).length,
    flagged: visits.filter(v => !v.verified).length,
  }), [visits])

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
        <span style={{ color: 'var(--text-muted)' }}>to</span>
        <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
        <select value={filters.riderId} onChange={e => setFilters(f => ({ ...f, riderId: e.target.value }))}>
          <option value="">All riders</option>
          {riders.map(r => <option key={r.id || r.uid} value={r.id || r.uid}>{r.name || r.email}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={filters.flagged} onChange={e => setFilters(f => ({ ...f, flagged: e.target.checked }))} /> Flagged only
        </label>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--text-secondary)' }}>
          {summary.total} visits · <span style={{ color: 'var(--secondary)' }}>{summary.verified} at location</span> · <span style={{ color: '#b45309' }}>{summary.flagged} flagged</span>
        </div>
      </div>

      {error && <div className="alert-strip alert-danger">{error}</div>}
      {!loading && visits.length === 0 && !error && <div className="empty-state">No visits in this period.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visits.map(v => <VisitRow key={v.id} visit={v} />)}
      </div>

      <OutcomeEditor canEdit={role === 'admin'} />
      {role === 'admin' && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <Save size={12} /> Outcome changes save immediately.
        </div>
      )}
    </div>
  )
}
