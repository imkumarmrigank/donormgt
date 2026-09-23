// Frontend/src/pages/TodayPickups.jsx
// Tabs: Pending / Completed / Others — real-time via AppContext
// ENHANCEMENT: Location-based sort (Sector → Society) with grouped view
import { useMemo, useState } from 'react'
import {
  Calendar, Truck, CheckCircle, Clock,
  MapPin, Phone, Hash, AlertTriangle,
  Users, ChevronRight, ClipboardList, ArrowUpDown,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { useApp }  from '../context/AppContext'
import { useRole } from '../context/RoleContext'

const todayStr = () => new Date().toISOString().slice(0, 10)

// ── Chips ─────────────────────────────────────────────────────────────────────
function OrderIdChip({ id }) {
  if (!id) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontFamily: 'monospace', fontSize: 10.5, fontWeight: 700,
      color: 'var(--primary)', background: 'var(--primary-light)',
      padding: '2px 7px', borderRadius: 5,
      border: '1px solid rgba(232,82,26,0.2)', whiteSpace: 'nowrap',
    }}>
      <Hash size={9} />{id}
    </span>
  )
}

function TimeSlotBadge({ slot }) {
  if (!slot) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10.5, fontWeight: 600, padding: '2px 9px',
      borderRadius: 20, background: 'var(--border-light)',
      color: 'var(--text-muted)', whiteSpace: 'nowrap',
    }}>
      <Clock size={9} />{slot}
    </span>
  )
}

// ── Single pickup card ────────────────────────────────────────────────────────
function PickupCard({ pickup, onRecord }) {
  const isPending   = pickup.status === 'Pending'
  const isCompleted = pickup.status === 'Completed'
  const isDrive     = pickup.pickupMode === 'Drive'

  const borderColor = isCompleted ? 'var(--secondary)' : isPending ? 'var(--info)' : 'var(--warning)'
  const avatarBg    = isCompleted ? 'var(--secondary-light)' : isPending ? 'var(--info-bg)' : 'var(--warning-bg)'
  const avatarColor = isCompleted ? 'var(--secondary)' : isPending ? 'var(--info)' : 'var(--warning)'

  const rstCount   = (pickup.rstItems  || []).length
  const sksCount   = (pickup.sksItems  || []).length
  const totalItems = rstCount + sksCount
  const MAX_TAGS   = 4

  return (
    <div
      className="card"
      style={{
        marginBottom: 10,
        borderLeft: `4px solid ${borderColor}`,
        opacity: isCompleted ? 0.88 : 1,
        transition: 'box-shadow 0.15s',
      }}
    >
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>

          {/* Avatar */}
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            background: avatarBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            color: avatarColor,
          }}>
            {(pickup.donorName || '?')[0].toUpperCase()}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              <OrderIdChip id={pickup.orderId || pickup.id} />
              {isDrive && (
                <span className="badge badge-info" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Users size={8} />Drive
                </span>
              )}
              <span
                className={`badge ${isCompleted ? 'badge-success' : isPending ? 'badge-info' : 'badge-warning'}`}
                style={{ fontSize: 10 }}
              >
                {isCompleted ? 'Completed' : isPending ? 'Scheduled' : pickup.status}
              </span>
              <TimeSlotBadge slot={pickup.timeSlot} />
            </div>

            <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text-primary)', marginBottom: 3 }}>
              {pickup.donorName}
            </div>
            {pickup.mobile && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <Phone size={10} /> {pickup.mobile}
              </div>
            )}
            {(pickup.society || pickup.sector) && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={10} style={{ flexShrink: 0 }} />
                <span className="truncate">
                  {[pickup.society, pickup.sector, pickup.city].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
            {totalItems > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 7 }}>
                {(pickup.rstItems || []).slice(0, MAX_TAGS).map(item => (
                  <span key={item} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: 'var(--secondary-light)', color: 'var(--secondary)', fontWeight: 600 }}>
                    {item}
                  </span>
                ))}
                {(pickup.sksItems || []).slice(0, Math.max(0, MAX_TAGS - rstCount)).map(item => (
                  <span key={item} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: 'var(--info-bg)', color: 'var(--info)', fontWeight: 600 }}>
                    {item}
                  </span>
                ))}
                {totalItems > MAX_TAGS && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '1px 4px' }}>+{totalItems - MAX_TAGS} more</span>
                )}
              </div>
            )}
            {pickup.notes && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 6, padding: '4px 8px', background: 'var(--bg)', borderRadius: 5 }}>
                📝 {pickup.notes}
              </div>
            )}
          </div>

          {/* Action */}
          <div style={{ flexShrink: 0, paddingTop: 2 }}>
            {isPending ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onRecord(pickup)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                <Truck size={13} />Record<ChevronRight size={12} />
              </button>
            ) : isCompleted ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--secondary)', padding: '7px 12px', background: 'var(--secondary-light)', borderRadius: 8, whiteSpace: 'nowrap' }}>
                <CheckCircle size={13} /> Done
              </div>
            ) : (
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--warning)', padding: '6px 10px', background: 'var(--warning-bg)', borderRadius: 8, whiteSpace: 'nowrap' }}>
                {pickup.status}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sector group header ───────────────────────────────────────────────────────
function SectorGroup({ sector, pickups, onRecord, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  const pendingCount   = pickups.filter(p => p.status === 'Pending').length
  const completedCount = pickups.filter(p => p.status === 'Completed').length

  // Group by society within sector
  const bySociety = useMemo(() => {
    const map = {}
    pickups.forEach(p => {
      const key = p.society || 'Other'
      if (!map[key]) map[key] = []
      map[key].push(p)
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [pickups])

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Sector header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', marginBottom: open ? 8 : 0,
          background: 'linear-gradient(135deg, var(--secondary) 0%, var(--secondary-dark) 100%)',
          borderRadius: open ? '10px 10px 0 0' : 10,
          border: 'none', cursor: 'pointer', textAlign: 'left',
          transition: 'border-radius 0.15s',
        }}
      >
        <MapPin size={14} color="rgba(255,255,255,0.8)" style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 13.5, color: 'white', flex: 1 }}>
          {sector}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {pendingCount > 0 && (
            <span style={{ background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '1px 8px' }}>
              {pendingCount} pending
            </span>
          )}
          {completedCount > 0 && (
            <span style={{ background: 'rgba(34,197,94,0.3)', color: 'white', borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '1px 8px' }}>
              {completedCount} done
            </span>
          )}
          <span style={{ color: 'rgba(255,255,255,0.7)', display: 'flex' }}>
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </div>
      </button>

      {open && (
        <div style={{ border: '1px solid var(--secondary)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden', background: 'var(--bg)' }}>
          {bySociety.map(([society, sPickups]) => (
            <div key={society}>
              {/* Society sub-header */}
              {bySociety.length > 1 && (
                <div style={{
                  padding: '6px 14px',
                  background: 'var(--secondary-light)',
                  borderBottom: '1px solid rgba(27,94,53,0.12)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 11.5, fontWeight: 700, color: 'var(--secondary)',
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--secondary)', flexShrink: 0 }} />
                  {society}
                  <span style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--secondary)', opacity: 0.7, marginLeft: 2 }}>
                    · {sPickups.length} pickup{sPickups.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              <div style={{ padding: '8px 8px 0' }}>
                {sPickups.map(p => <PickupCard key={p.id} pickup={p} onRecord={onRecord} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sort Controls ─────────────────────────────────────────────────────────────
function SortControl({ sortMode, setSortMode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 14, padding: '8px 12px',
      background: 'var(--surface)', borderRadius: 8,
      border: '1px solid var(--border-light)',
      boxShadow: 'var(--shadow)',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <ArrowUpDown size={13} color="var(--text-muted)" />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Sort by:
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => setSortMode('time')}
          className={`btn btn-sm ${sortMode === 'time' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <Clock size={12} /> Time Slot
        </button>
        <button
          onClick={() => setSortMode('location')}
          className={`btn btn-sm ${sortMode === 'location' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <MapPin size={12} /> Sector → Society
        </button>
      </div>
      {sortMode === 'location' && (
        <span style={{ fontSize: 11, color: 'var(--secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <MapPin size={10} /> Grouped by area for efficient routing
        </span>
      )}
    </div>
  )
}

// ── Tab Button ────────────────────────────────────────────────────────────────
function TabBtn({ label, count, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', borderRadius: 8, border: 'none',
        cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500,
        color: active ? color : 'var(--text-muted)',
        background: active ? 'var(--surface)' : 'transparent',
        boxShadow: active ? '0 1px 6px rgba(0,0,0,0.1)' : 'none',
        transition: 'all 0.15s',
        position: 'relative',
      }}
    >
      {label}
      <span style={{
        background: active ? color : 'var(--border)',
        color: active ? 'white' : 'var(--text-muted)',
        borderRadius: 20, fontSize: 11, fontWeight: 700,
        padding: '1px 8px', lineHeight: 1.5,
        transition: 'all 0.15s',
      }}>
        {count}
      </span>
      {active && (
        <span style={{
          position: 'absolute', bottom: -4, left: '50%',
          transform: 'translateX(-50%)',
          width: 32, height: 3, borderRadius: 2,
          background: color,
        }} />
      )}
    </button>
  )
}

// ── Location-grouped list ─────────────────────────────────────────────────────
function LocationGroupedList({ pickups, onRecord }) {
  // Group by sector first
  const bySector = useMemo(() => {
    const map = {}
    pickups.forEach(p => {
      const key = p.sector || 'Unassigned'
      if (!map[key]) map[key] = []
      map[key].push(p)
    })
    // Sort sectors; "Unassigned" goes last
    return Object.entries(map).sort(([a], [b]) => {
      if (a === 'Unassigned') return 1
      if (b === 'Unassigned') return -1
      return a.localeCompare(b)
    })
  }, [pickups])

  if (bySector.length === 0) return null

  return (
    <div>
      {bySector.map(([sector, sectorPickups]) => (
        <SectorGroup
          key={sector}
          sector={sector}
          pickups={sectorPickups}
          onRecord={onRecord}
          defaultOpen
        />
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function TodayPickups({ onNav }) {
  const { pickups } = useApp()
  const { role } = useRole()

  const [activeTab, setActiveTab] = useState('pending')
  const [sortMode,  setSortMode]  = useState('time') // 'time' | 'location'

  const today = todayStr()

  // Sort by time slot (original behaviour)
  const timeOrder = [
    '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
  ]

  // All pickups for today (any status) — used only for the progress bar and stats
  const allTodayPickups = useMemo(
    () => pickups.filter(p => p.date === today),
    [pickups, today]
  )
  const completed = useMemo(() => allTodayPickups.filter(p => p.status === 'Completed'), [allTodayPickups])
  const others    = useMemo(
    () => allTodayPickups.filter(p => p.status !== 'Pending' && p.status !== 'Scheduled' && p.status !== 'Completed'),
    [allTodayPickups]
  )

  // Primary list: only pending/scheduled pickups for today — these are the ones
  // that still need to be actioned. Completed and other-status pickups are tracked
  // separately above so the progress bar remains accurate.
  const todayPickups = useMemo(() => {
    const base = pickups.filter(
      p => p.date === today && (p.status === 'Pending' || p.status === 'Scheduled')
    )

    if (sortMode === 'location') {
      // Sort: sector → society → donor name
      return [...base].sort((a, b) => {
        const secCmp = (a.sector  || 'ZZZ').localeCompare(b.sector  || 'ZZZ')
        if (secCmp !== 0) return secCmp
        const socCmp = (a.society || 'ZZZ').localeCompare(b.society || 'ZZZ')
        if (socCmp !== 0) return socCmp
        return (a.donorName || '').localeCompare(b.donorName || '')
      })
    }

    // Default: sort by time slot
    return [...base].sort((a, b) => {
      const at = timeOrder.findIndex(t => (a.timeSlot || '').startsWith(t))
      const bt = timeOrder.findIndex(t => (b.timeSlot || '').startsWith(t))
      if (at !== -1 && bt !== -1 && at !== bt) return at - bt
      if (at === -1 && bt !== -1) return 1
      if (at !== -1 && bt === -1) return -1
      return (a.donorName || '').localeCompare(b.donorName || '')
    })
  }, [pickups, today, sortMode])

  const pending = todayPickups  // pending IS todayPickups (already filtered above)

  const handleRecord = (pickup) => onNav('pickups', {
    donorId:  pickup.donorId,
    pickupId: pickup.id,
  })

  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const canSchedule = role === 'admin' || role === 'manager'
  // Progress uses ALL today's pickups as denominator so completed ones are counted
  // even though they've moved out of the pending list
  const progressPct = allTodayPickups.length > 0
    ? Math.round((completed.length / allTodayPickups.length) * 100)
    : 0

  // Render the appropriate list (flat or grouped) for a given set of pickups
  const renderPickupList = (list, emptyTitle, emptyText, emptyIcon) => {
    if (list.length === 0) {
      return (
        <div className="empty-state" style={{ padding: 48 }}>
          <div className="empty-icon" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
            {emptyIcon}
          </div>
          <h3>{emptyTitle}</h3>
          <p>{emptyText}</p>
        </div>
      )
    }

    if (sortMode === 'location') {
      return <LocationGroupedList pickups={list} onRecord={handleRecord} />
    }

    return list.map(p => <PickupCard key={p.id} pickup={p} onRecord={handleRecord} />)
  }

  return (
    <div className="page-body">

      {/* ── Hero header ── */}
      <div style={{
        marginBottom: 20, padding: '18px 22px',
        background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
        borderRadius: 'var(--radius)', boxShadow: '0 4px 18px rgba(232,82,26,0.28)',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ width: 48, height: 48, borderRadius: 13, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Calendar size={23} color="white" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, color: 'white', lineHeight: 1.2 }}>
            Today's Pickups
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.78)', marginTop: 3 }}>{todayFormatted}</div>
          {allTodayPickups.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden', width: 200, maxWidth: '100%' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${progressPct}%`, background: 'rgba(255,255,255,0.9)', transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                {completed.length} of {allTodayPickups.length} completed · {progressPct}%
              </div>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, color: 'white', lineHeight: 1 }}>
            {pending.length}
          </div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>
            Pending Today
          </div>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card blue">
          <div className="stat-icon"><Clock size={18} /></div>
          <div className="stat-value">{pending.length}</div>
          <div className="stat-label">Pending</div>
          <div className="stat-change up">Awaiting recording</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon"><CheckCircle size={18} /></div>
          <div className="stat-value">{completed.length}</div>
          <div className="stat-label">Completed</div>
          <div className="stat-change up">Done today ✓</div>
        </div>
        {others.length > 0 && (
          <div className="stat-card yellow">
            <div className="stat-icon"><AlertTriangle size={18} /></div>
            <div className="stat-value">{others.length}</div>
            <div className="stat-label">Postponed / No Answer</div>
            <div className="stat-change down">Needs follow-up</div>
          </div>
        )}
      </div>

      {/* ── "Others" alert ── */}
      {others.length > 0 && (
        <div className="alert-strip alert-warning" style={{ marginBottom: 16 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>
            <strong>{others.length} pickup{others.length > 1 ? 's' : ''}</strong> marked as Postponed or No Answer — follow up required.
          </span>
        </div>
      )}

      {/* ── Tabs ── */}
      {allTodayPickups.length > 0 && (
        <div style={{
          display: 'flex', gap: 4, padding: '4px 6px',
          background: 'var(--border-light)', borderRadius: 12,
          width: 'fit-content', marginBottom: 20,
        }}>
          <TabBtn
            label="Pending"
            count={pending.length}
            active={activeTab === 'pending'}
            color="var(--info)"
            onClick={() => setActiveTab('pending')}
          />
          <TabBtn
            label="Completed"
            count={completed.length}
            active={activeTab === 'completed'}
            color="var(--secondary)"
            onClick={() => setActiveTab('completed')}
          />
          {others.length > 0 && (
            <TabBtn
              label="Others"
              count={others.length}
              active={activeTab === 'others'}
              color="var(--warning)"
              onClick={() => setActiveTab('others')}
            />
          )}
        </div>
      )}

      {/* ── Tab Content ── */}
      {/* Use allTodayPickups (all statuses) for the outer guard so that days
           where all pickups are completed still show the tab UI with the
           Completed tab — not the "No Pickups Scheduled Today" empty state. */}
      {allTodayPickups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            <ClipboardList size={26} />
          </div>
          <h3>No Pickups Scheduled Today</h3>
          <p>
            {canSchedule
              ? "No pickups are assigned for today. Use the Pickup Scheduler to plan today's collection."
              : "No pickups are assigned for today. Your manager will schedule pickups and they will appear here."}
          </p>
          {canSchedule && (
            <button className="btn btn-outline btn-sm" style={{ marginTop: 16 }} onClick={() => onNav('pickupscheduler')}>
              Open Pickup Scheduler →
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Sort control — always shown when there are pickups */}
          <SortControl sortMode={sortMode} setSortMode={setSortMode} />

          {/* PENDING TAB */}
          {activeTab === 'pending' && (
            <>
              {pending.length === 0 ? (
                <div className="empty-state" style={{ padding: 48 }}>
                  <div className="empty-icon" style={{ background: 'var(--secondary-light)', color: 'var(--secondary)' }}>
                    <CheckCircle size={24} />
                  </div>
                  <h3>All Done! 🎉</h3>
                  <p>All pickups for today have been completed.</p>
                </div>
              ) : (
                <>
                  {sortMode === 'time' && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={12} color="var(--info)" />
                      <span><strong style={{ color: 'var(--text-primary)' }}>{pending.length}</strong> pickup{pending.length !== 1 ? 's' : ''} — sorted by time slot</span>
                    </div>
                  )}
                  {sortMode === 'location' && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={12} color="var(--secondary)" />
                      <span><strong style={{ color: 'var(--text-primary)' }}>{pending.length}</strong> pickup{pending.length !== 1 ? 's' : ''} — grouped by sector and society for efficient routing</span>
                    </div>
                  )}
                  {renderPickupList(
                    pending,
                    'All Done! 🎉',
                    'All pickups for today have been completed.',
                    <CheckCircle size={24} />
                  )}
                </>
              )}
            </>
          )}

          {/* COMPLETED TAB */}
          {activeTab === 'completed' && (
            <>
              {completed.length === 0 ? (
                <div className="empty-state" style={{ padding: 48 }}>
                  <div className="empty-icon" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
                    <Truck size={24} />
                  </div>
                  <h3>No Completed Pickups Yet</h3>
                  <p>Completed pickups will appear here once recorded.</p>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle size={12} color="var(--secondary)" />
                    <span><strong style={{ color: 'var(--text-primary)' }}>{completed.length}</strong> pickup{completed.length !== 1 ? 's' : ''} completed today</span>
                  </div>
                  {renderPickupList(
                    completed,
                    'No Completed Pickups Yet',
                    'Completed pickups will appear here once recorded.',
                    <Truck size={24} />
                  )}
                </>
              )}
            </>
          )}

          {/* OTHERS TAB */}
          {activeTab === 'others' && others.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                <strong style={{ color: 'var(--warning)' }}>{others.length}</strong> pickup{others.length !== 1 ? 's' : ''} with status requiring attention
              </div>
              {renderPickupList(
                others,
                'No Issues',
                'All pickups are in a normal state.',
                <AlertTriangle size={24} />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}