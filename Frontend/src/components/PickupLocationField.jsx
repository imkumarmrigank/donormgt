import { useState } from 'react'
import { Crosshair, ExternalLink, MapPin, X } from 'lucide-react'
import { getCurrentPosition, mapsLink, parseCoordinates } from '../utils/geo'

/**
 * Pickup pin: the point a rider must be within 100 m of when recording a visit.
 * Set it from this device's GPS (when standing at the donor's door) or by pasting
 * coordinates / a Google Maps link.
 */
export default function PickupLocationField({ value, onChange, savedFromDonor }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pasted, setPasted] = useState('')

  const useCurrent = async () => {
    setBusy(true); setError('')
    try {
      const position = await getCurrentPosition()
      onChange({ ...position, source: 'scheduler-gps' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const applyPasted = (text) => {
    setPasted(text)
    if (!text.trim()) { setError(''); return }
    const coords = parseCoordinates(text)
    if (coords) {
      onChange({ ...coords, source: 'manual' })
      setPasted('')
      setError('')
    } else {
      setError('No coordinates found. In Google Maps, long-press the spot and copy the numbers shown (e.g. 28.4595, 77.0266).')
    }
  }

  return (
    <div className="form-group" style={{ margin: 0 }}>
      <label>
        Pickup Location
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>(riders must be within 100 m to mark a visit)</span>
      </label>

      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--secondary-light)', borderRadius: 8, fontSize: 12.5, color: 'var(--secondary)' }}>
          <MapPin size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            {value.accuracy ? <span style={{ opacity: 0.75 }}> · ±{value.accuracy} m</span> : null}
            {savedFromDonor ? <span style={{ opacity: 0.75 }}> · saved for this donor</span> : null}
          </span>
          <a href={mapsLink(value)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'inherit', fontWeight: 600 }}>
            Map <ExternalLink size={11} />
          </a>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Remove pin" onClick={() => onChange(null)}>
            <X size={13} />
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--warning, #b45309)', marginBottom: 6 }}>
          No pin yet. Visits to this pickup will be flagged until one is set.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={useCurrent} disabled={busy}>
          <Crosshair size={13} /> {busy ? 'Locating…' : 'Use my current location'}
        </button>
        <input
          value={pasted}
          onChange={e => applyPasted(e.target.value)}
          placeholder="or paste coordinates / Google Maps link"
          style={{ flex: 1, minWidth: 200, fontSize: 12.5 }}
        />
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{error}</div>}
    </div>
  )
}
