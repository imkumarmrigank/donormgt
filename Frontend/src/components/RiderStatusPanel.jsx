// Dashboard panel and Live Riders page body: today's rider pickups by stage, the live
// map, and a list of riders with their current pickups.
import { useState } from 'react'
import { AlertTriangle, Bike, CheckCircle2, ClipboardList, MapPinned, Navigation, ThumbsUp, UserCheck } from 'lucide-react'
import LiveRidersMap from './LiveRidersMap'
import useLiveRiders from '../hooks/useLiveRiders'
import { isStale, lastSeenText, riderColor } from '../utils/liveRiders'
import { distanceMeters, formatDistance } from '../utils/geo'

const STAGES = [
  { key: 'assigned', label: 'Assigned', icon: ClipboardList, color: '#6b7280' },
  { key: 'accepted', label: 'Accepted', icon: ThumbsUp, color: '#2563eb' },
  { key: 'started', label: 'On the way', icon: Navigation, color: '#9333ea' },
  { key: 'visited', label: 'Visited', icon: CheckCircle2, color: '#16a34a' },
  { key: 'flagged', label: 'Flagged', icon: AlertTriangle, color: '#d97706' },
]

export default function RiderStatusPanel({ compact = false, onOpenFull }) {
  const { data, error } = useLiveRiders(compact ? 30000 : 15000)
  const [focus, setFocus] = useState(null)
  const riders = data?.riders || []
  const summary = data?.summary || {}
  // "Now" as of the last refresh, so ages stay consistent with the data shown.
  const now = data ? new Date(data.generatedAt).getTime() : 0

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapPinned size={17} color="var(--primary)" />
        <div className="card-title" style={{ flex: 1 }}>Riders right now</div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {summary.liveRiders || 0} live · updates every {compact ? 30 : 15}s
        </span>
        {compact && onOpenFull && (
          <button className="btn btn-ghost btn-sm" onClick={onOpenFull}>Open live map →</button>
        )}
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          {STAGES.map(stage => (
            <div key={stage.key} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-alt)', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
                <stage.icon size={13} color={stage.color} /> {stage.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: stage.color, marginTop: 2 }}>{summary[stage.key] ?? 0}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: -6 }}>
          Today's pickups assigned to riders ({summary.total ?? 0}). Flagged = last visit not verified at the pickup location.
        </div>

        {error && <div className="alert-strip alert-danger">{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 14 }}>
          <LiveRidersMap riders={riders} height={compact ? 320 : 560} focusRiderId={focus} />

          {!compact && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 560, overflowY: 'auto' }}>
              {riders.length === 0 && (
                <div className="empty-state" style={{ fontSize: 13 }}>
                  <div className="empty-icon"><Bike size={26} /></div>
                  No rider has an accepted pickup right now.
                </div>
              )}
              {riders.map((rider, index) => {
                const stale = isStale(rider, now)
                return (
                  <button key={rider.riderId} type="button" onClick={() => setFocus(f => (f === rider.riderId ? null : rider.riderId))}
                    style={{ textAlign: 'left', padding: 12, borderRadius: 10, cursor: 'pointer', background: focus === rider.riderId ? 'var(--primary-light)' : 'var(--surface)', border: `1.5px solid ${focus === rider.riderId ? 'var(--primary)' : 'var(--border-light)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 5, background: stale ? '#9ca3af' : riderColor(index) }} />
                      <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>{rider.riderName}</span>
                      <span style={{ fontSize: 11, color: stale ? '#b45309' : 'var(--text-muted)' }}>
                        {rider.lastSeenAt ? lastSeenText(rider.lastSeenAt, now) : 'app not open'}
                      </span>
                    </div>
                    {rider.trips.map(trip => {
                      const away = rider.position && trip.geo ? distanceMeters(rider.position, trip.geo) : null
                      return (
                        <div key={trip.pickupId} style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <UserCheck size={12} style={{ flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>{trip.orderId} · {trip.donorName}{trip.timeSlot ? ` · ${trip.timeSlot}` : ''}</span>
                          <span className={`badge ${trip.stage === 'started' ? 'badge-primary' : 'badge-info'}`}>{trip.stage === 'started' ? 'On the way' : 'Accepted'}</span>
                          {away !== null && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDistance(away)}</span>}
                        </div>
                      )
                    })}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
