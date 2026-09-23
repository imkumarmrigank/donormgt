import { AlertCircle, CheckCircle, GitMerge, MapPin, Phone } from 'lucide-react'

/**
 * DonorDuplicateAlert — shown when mobile matches an existing user.
 *
 * Props:
 *   donor         — existing donor/supporter object
 *   context       — 'adding-donor' | 'adding-supporter' | 'pickup'
 *                   Controls the headline and merge messaging.
 *   onUseExisting — () => void  — primary action button handler
 *   onDismiss     — () => void  — dismiss / continue without merging
 *   message       — optional override for the headline text
 */
export default function DonorDuplicateAlert({
  donor,
  context = 'pickup',
  onUseExisting,
  onDismiss,
  message,
}) {
  if (!donor) return null

  const existingRole = donor.donorType || 'donor'

  // ── Contextual headline + merge metadata ─────────────────────────────────
  let headline = message
  let mergeNote = null
  let primaryLabel = 'Use This Donor'
  let mergeFrom = null
  let mergeTo = null

  if (!headline) {
    if (context === 'adding-donor') {
      if (existingRole === 'supporter') {
        headline = 'This person is already a Supporter ❤️'
        mergeNote = 'Saving will upgrade them to a combined Donor + Supporter profile.'
        primaryLabel = 'Merge & Add as Donor'
        mergeFrom = '❤️'
        mergeTo = '👍❤️'
      } else if (existingRole === 'both') {
        headline = 'This person is already a Donor + Supporter'
        mergeNote = 'They already have both roles — no duplicate will be created.'
        primaryLabel = 'Use Existing Profile'
      } else {
        headline = 'A donor with this mobile already exists'
        primaryLabel = 'Use This Donor'
      }
    } else if (context === 'adding-supporter') {
      if (existingRole === 'donor') {
        headline = 'This user is also an RST/SKS Donor 👍'
        mergeNote = 'Saving will upgrade them to a combined Donor + Supporter profile.'
        primaryLabel = 'Merge & Add as Supporter'
        mergeFrom = '👍'
        mergeTo = '👍❤️'
      } else if (existingRole === 'both') {
        headline = 'This person is already a Donor + Supporter'
        mergeNote = 'They already have both roles — no duplicate will be created.'
        primaryLabel = 'Use Existing Profile'
      } else {
        headline = 'A supporter with this mobile already exists'
        primaryLabel = 'Use Existing Profile'
      }
    } else {
      // 'pickup' context — neutral
      headline = 'A donor/supporter with this mobile already exists'
    }
  }

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10, marginBottom: 12,
      background: 'var(--warning-bg)',
      border: '1px solid rgba(245,158,11,0.35)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>

      {/* Headline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertCircle size={15} color="var(--warning)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
          {headline}
        </span>
      </div>

      {/* Existing user summary */}
      <div style={{ fontSize: 12.5, color: '#92400E', paddingLeft: 23, lineHeight: 1.6 }}>
        <strong>{donor.name}</strong>

        {(donor.society || donor.sector || donor.city) && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
            <MapPin size={10} />
            {[donor.society, donor.sector, donor.city].filter(Boolean).join(', ')}
          </span>
        )}

        {donor.mobile && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
            <Phone size={10} /> {donor.mobile}
          </span>
        )}

        <span style={{
          marginLeft: 8, fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
          background: 'rgba(245,158,11,0.2)', padding: '1px 6px', borderRadius: 4,
        }}>
          {donor.id}
        </span>
      </div>

      {/* Role merge arrow indicator */}
      {mergeFrom && mergeTo && (
        <div style={{
          paddingLeft: 23, display: 'flex', alignItems: 'center', gap: 7,
          fontSize: 12.5, color: '#78350F',
        }}>
          <GitMerge size={13} color="#92400E" />
          <span style={{ fontSize: 16 }}>{mergeFrom}</span>
          <span style={{ fontWeight: 700, fontSize: 12 }}>+</span>
          <span style={{ fontSize: 16 }}>{mergeFrom === '❤️' ? '👍' : '❤️'}</span>
          <span style={{ fontWeight: 700, marginLeft: 2 }}>→ {mergeTo} Combined Profile</span>
        </div>
      )}

      {/* Merge explanation note */}
      {mergeNote && (
        <div style={{ paddingLeft: 23, fontSize: 11.5, color: '#92400E', fontStyle: 'italic' }}>
          {mergeNote}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, paddingLeft: 23, flexWrap: 'wrap' }}>
        {onUseExisting && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onUseExisting}
            style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <CheckCircle size={12} /> {primaryLabel}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onDismiss}
            style={{ fontSize: 12 }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}