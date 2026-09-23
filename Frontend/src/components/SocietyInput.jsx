// Frontend/src/components/SocietyInput.jsx
// Reusable society selector: native <select> for known societies +
// text input fallback for custom names. Works reliably on all devices.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'

/**
 * SocietyInput
 * Props:
 *  city     — selected city string
 *  sector   — selected sector string
 *  value    — current society value
 *  onChange — (value: string) => void
 *  id       — optional id string
 *  style    — optional extra input style
 */
export default function SocietyInput({ city, sector, value, onChange, id, style }) {
  const [customChoice, setCustomChoice] = useState({ key: '', enabled: false })
  const { locations } = useApp()

  const locationKey = `${city || ''}::${sector || ''}`
  const customMode = customChoice.enabled && customChoice.key === locationKey

  // Build suggestion list for the current city + sector
  const suggestions = useMemo(() => {
    if (!city || !sector) return []
    const key = `${city}::${sector}`
    return locations.sectorSocieties?.[key] || []
  }, [city, sector, locations.sectorSocieties])

  // True if the stored value is a custom one not in the known list
  const isCustomValue = Boolean(value && suggestions.length > 0 && !suggestions.includes(value))

  // Show plain text input when:
  //  - no city / no sector chosen yet for non-Gurgaon
  //  - non-Gurgaon city (no suggestions available)
  //  - user explicitly chose "Type custom name"
  //  - the existing value is already a custom name
  const useTextInput = customMode || isCustomValue || suggestions.length === 0

  // ── Text input mode ─────────────────────────────────────────────────────
  if (useTextInput) {
    const placeholder =
      suggestions.length === 0
        ? 'e.g. Green Park Residency'
        : 'Type your society / colony name…'

    return (
      <div>
        <input
          id={id}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          style={{ width: '100%', ...style }}
        />
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {suggestions.length > 0 && (
            <button
              type="button"
              onClick={() => setCustomChoice({ key: locationKey, enabled: false })}
              style={{
                fontSize: 11, color: 'var(--primary)', background: 'none',
                border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0,
              }}
            >
              ← Choose from {suggestions.length} known societies
            </button>
          )}
          {isCustomValue && (
            <span style={{ fontSize: 11, color: 'var(--secondary)', fontWeight: 600 }}>
              Custom: "{value}"
            </span>
          )}
          {suggestions.length === 0 && city && sector && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              No predefined societies for this area — type any name
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── Select / dropdown mode ───────────────────────────────────────────────
  return (
    <div>
      <select
        id={id}
        value={value || ''}
        onChange={e => {
          const v = e.target.value
          if (v === '__custom__') {
            setCustomChoice({ key: locationKey, enabled: true })
            onChange('')
          } else {
            setCustomChoice({ key: locationKey, enabled: false })
            onChange(v)
          }
        }}
        style={{ width: '100%', ...style }}
      >
        <option value="">
          {sector ? `— Select society in ${sector} —` : '— Select a society —'}
        </option>
        {suggestions.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
        <option value="__custom__">✏️Add Society…</option>
      </select>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
        {suggestions.length} societies available · or choose "Type a custom name"
      </div>
    </div>
  )
}
