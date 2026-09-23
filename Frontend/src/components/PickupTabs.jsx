// src/components/PickupTabs.jsx
// Unified scheduler tabs with role-based action controls:
//   Admin    → Edit · Reschedule · Delete
//   Manager  → Edit · Reschedule          (no delete)
//   Others   → read-only (no actions shown)
// Reschedule modal works inline for all four tabs.
// AtRisk/Churned entries have synthetic TAB-{donorId} IDs — reschedule
// creates a new pickup for those donors; Overdue/Scheduled reschedule
// updates the existing pickup record.

import { useState }         from 'react'
import {
  AlertTriangle, Calendar, Clock, UserX, Hash,
  CalendarClock, Pencil, Trash2, X, Check
} from 'lucide-react'
import { fmtDate } from '../utils/helpers'

const TABS = [
  { id: 'overdue',   label: 'Overdue Pickups',   icon: AlertTriangle, color: 'var(--danger)',     bg: 'var(--danger-bg)' },
  { id: 'scheduled', label: 'Scheduled Pickups',  icon: Calendar,      color: 'var(--info)',       bg: 'var(--info-bg)' },
  { id: 'atRisk',    label: 'At Risk Schedules',  icon: Clock,         color: 'var(--warning)',    bg: 'var(--warning-bg)' },
  { id: 'churned',   label: 'Churned Pickups',    icon: UserX,         color: 'var(--text-muted)', bg: 'var(--border-light)' },
]

const TIME_SLOTS = [
  '9:00 AM – 10:00 AM',
  '10:00 AM – 11:00 AM',
  '11:00 AM – 12:00 PM',
  '12:00 PM – 1:00 PM',
  '2:00 PM – 3:00 PM',
  '3:00 PM – 4:00 PM',
  '4:00 PM – 5:00 PM',
  '5:00 PM – 6:00 PM',
]

// ── Helpers ────────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10) }

/** True when the entry has a real pickup ID (not a synthetic donor-level ID) */
function isRealPickup(entry) { return entry?.id && !String(entry.id).startsWith('TAB-') }

// ── Order ID chip ─────────────────────────────────────────────────────────────
function OrderIdChip({ orderId }) {
  if (!orderId) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontFamily: 'monospace', fontSize: 10.5, fontWeight: 600,
      color: 'var(--primary)', background: 'var(--primary-light)',
      padding: '2px 7px', borderRadius: 5,
      border: '1px solid rgba(232,82,26,0.2)',
      whiteSpace: 'nowrap',
    }}>
      <Hash size={9} />{orderId}
    </span>
  )
}

// ── Inline reschedule modal ────────────────────────────────────────────────────
function RescheduleModal({ entry, onConfirm, onClose, saving }) {
  const [date,     setDate]     = useState('')
  const [timeSlot, setTimeSlot] = useState(entry?.timeSlot || '')
  const [notes,    setNotes]    = useState('')
  const isSynthetic = !isRealPickup(entry)
  const valid = !!date

  const handleConfirm = () => {
    if (!valid) return
    onConfirm(entry, { date, timeSlot, notes })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: 28,
        width: 'min(420px, 96vw)', boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
        border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 15 }}>
              <CalendarClock size={17} color="var(--primary)" />
              Reschedule Pickup
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {entry?.donorName}
              {entry?.society ? ` · ${entry.society}` : ''}
              {isSynthetic && (
                <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600,
                  background: 'var(--warning-bg)', color: '#92400E',
                  padding: '1px 7px', borderRadius: 10 }}>
                  New pickup will be created
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Current scheduled date (if overdue/scheduled) */}
        {entry?.scheduledDate && (
          <div style={{
            background: 'var(--danger-bg)', borderRadius: 8, padding: '8px 12px',
            fontSize: 12.5, color: 'var(--danger)', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            <AlertTriangle size={13} />
            Currently scheduled: <strong>{fmtDate(entry.scheduledDate)}</strong>
            {entry.daysOverdue ? ` · ${entry.daysOverdue} days overdue` : ''}
          </div>
        )}

        {/* New date */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
            New Pickup Date <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="date"
            value={date}
            min={todayStr()}
            onChange={e => setDate(e.target.value)}
            style={{
              width: '100%', height: 38, padding: '0 12px',
              border: `1.5px solid ${date ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 8, background: 'var(--bg)',
              fontSize: 13, color: 'var(--text-primary)', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Time slot */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
            Time Slot <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
          </label>
          <select
            value={timeSlot}
            onChange={e => setTimeSlot(e.target.value)}
            style={{
              width: '100%', height: 38, padding: '0 10px',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--bg)', fontSize: 13, color: 'var(--text-primary)',
            }}
          >
            <option value="">Select a time slot…</option>
            {TIME_SLOTS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
            Reason / Notes <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Donor requested change, donor unavailable…"
            style={{
              width: '100%', minHeight: 60, padding: '8px 12px',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--bg)', fontSize: 12.5,
              color: 'var(--text-primary)', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 40, borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-secondary)',
              fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!valid || saving}
            style={{
              flex: 2, height: 40, borderRadius: 8, border: 'none',
              background: valid ? 'var(--primary)' : 'var(--border)',
              color: valid ? 'white' : 'var(--text-muted)',
              fontWeight: 700, fontSize: 13, cursor: valid ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            {saving ? (
              <><span style={{
                display: 'inline-block', width: 13, height: 13,
                border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white',
                borderRadius: '50%', animation: 'spin 0.7s linear infinite',
              }} /> Rescheduling…</>
            ) : (
              <><Check size={14} /> Confirm Reschedule</>
            )}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Action button cluster ─────────────────────────────────────────────────────
// Rendered per-row; visibility controlled by role prop.
function RowActions({ entry, role, onReschedule, onEdit, onDelete, tabId }) {
  if (!role || role === 'executive') return null  // executives see no actions

  const canDelete    = role === 'admin'
  const canReschedule = role === 'admin' || role === 'manager'
  const canEdit      = role === 'admin' || role === 'manager'

  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap' }}>
      {canReschedule && (
        <button
          type="button"
          className="btn btn-sm"
          title="Reschedule this pickup"
          onClick={() => onReschedule?.(entry)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', fontSize: 11.5, fontWeight: 600,
            border: '1.5px solid var(--primary)', color: 'var(--primary)',
            background: 'var(--primary-light)', borderRadius: 6, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <CalendarClock size={12} /> Reschedule
        </button>
      )}
      {canEdit && isRealPickup(entry) && (
        <button
          type="button"
          className="btn btn-sm"
          title="Edit pickup"
          onClick={() => onEdit?.(entry)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 9px', fontSize: 11.5, fontWeight: 600,
            border: '1px solid var(--border)', color: 'var(--text-secondary)',
            background: 'var(--surface)', borderRadius: 6, cursor: 'pointer',
          }}
        >
          <Pencil size={11} /> Edit
        </button>
      )}
      {canDelete && isRealPickup(entry) && (
        <button
          type="button"
          className="btn btn-sm"
          title="Delete pickup (Admin only)"
          onClick={() => onDelete?.(entry)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 9px', fontSize: 11.5, fontWeight: 600,
            border: '1px solid var(--danger)', color: 'var(--danger)',
            background: 'var(--danger-bg)', borderRadius: 6, cursor: 'pointer',
          }}
        >
          <Trash2 size={11} /> Delete
        </button>
      )}
    </div>
  )
}

// ── Overdue table ─────────────────────────────────────────────────────────────
function OverdueTable({ data, role, onReschedule, onEdit, onDelete }) {
  if (!data.length) return <EmptySection message="No overdue pickups! Everything is on track." />
  const hasActions = role === 'admin' || role === 'manager'
  return (
    <>
      <div className="alert-strip alert-danger" style={{ marginBottom: 16 }}>
        <AlertTriangle size={14} style={{ flexShrink: 0 }} />
        <span><strong>{data.length} pickup{data.length > 1 ? 's' : ''}</strong> missed their scheduled date. Follow up immediately.</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Donor</th>
              <th>Location</th>
              <th>Scheduled Date</th>
              <th>Time Slot</th>
              <th>Days Overdue</th>
              <th>Notes</th>
              {hasActions && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={p.id}>
                <td><OrderIdChip orderId={p.orderId} /></td>
                <td>
                  <div style={{ fontWeight: 700 }}>{p.donorName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{p.mobile}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>
                  <div>{p.society}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.sector}, {p.city}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>{fmtDate(p.scheduledDate)}</td>
                <td>
                  <span className="badge badge-muted" style={{ fontSize: 10.5 }}>{p.timeSlot || '—'}</span>
                </td>
                <td>
                  <span className="badge badge-danger" style={{ fontSize: 11 }}>{p.daysOverdue} days</span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: p.notes ? 'italic' : 'normal' }}>
                  {p.notes || '—'}
                </td>
                {hasActions && (
                  <td>
                    <RowActions entry={p} role={role} onReschedule={onReschedule} onEdit={onEdit} onDelete={onDelete} tabId="overdue" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards">
        {data.map(p => (
          <MobileCard key={p.id} p={p} badge={<span className="badge badge-danger">{p.daysOverdue}d overdue</span>}
            role={role} onReschedule={onReschedule} onEdit={onEdit} onDelete={onDelete} tabId="overdue" />
        ))}
      </div>
    </>
  )
}

// ── Scheduled table ───────────────────────────────────────────────────────────
function ScheduledTable({ data, role, onReschedule, onEdit, onDelete }) {
  if (!data.length) return <EmptySection message="No upcoming pickups scheduled yet." />
  const hasActions = role === 'admin' || role === 'manager'
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Donor</th>
              <th>Location</th>
              <th>Pickup Date</th>
              <th>Time Slot</th>
              <th>Notes</th>
              {hasActions && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={p.id}>
                <td><OrderIdChip orderId={p.orderId} /></td>
                <td>
                  <div style={{ fontWeight: 700 }}>{p.donorName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{p.mobile}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>
                  <div>{p.society}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.sector}, {p.city}</div>
                </td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{fmtDate(p.scheduledDate)}</div>
                </td>
                <td>
                  <span className="badge badge-info" style={{ fontSize: 10.5 }}>{p.timeSlot || '—'}</span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: p.notes ? 'italic' : 'normal' }}>
                  {p.notes || '—'}
                </td>
                {hasActions && (
                  <td>
                    <RowActions entry={p} role={role} onReschedule={onReschedule} onEdit={onEdit} onDelete={onDelete} tabId="scheduled" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-cards">
        {data.map(p => (
          <MobileCard key={p.id} p={p} badge={<span className="badge badge-info">{fmtDate(p.scheduledDate)}</span>}
            role={role} onReschedule={onReschedule} onEdit={onEdit} onDelete={onDelete} tabId="scheduled" />
        ))}
      </div>
    </>
  )
}

// ── At Risk table ─────────────────────────────────────────────────────────────
function AtRiskTable({ data, role, onReschedule, onEdit, onDelete }) {
  if (!data.length) return <EmptySection message="No at-risk donors right now. Great job!" />
  const hasActions = role === 'admin' || role === 'manager'
  return (
    <>
      <div className="alert-strip alert-warning" style={{ marginBottom: 16 }}>
        <Clock size={14} style={{ flexShrink: 0 }} />
        <span><strong>{data.length} donor{data.length > 1 ? 's' : ''}</strong> are delaying pickups frequently — proactive outreach recommended.</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Donor</th>
              <th>Location</th>
              <th>Last Pickup</th>
              <th>Days Since</th>
              <th>Missed</th>
              <th>Notes</th>
              {hasActions && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{p.donorName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{p.mobile}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>
                  <div>{p.society}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.sector}, {p.city}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>{fmtDate(p.lastPickup)}</td>
                <td>
                  <span className="badge badge-warning" style={{ fontSize: 11 }}>{p.daysSincePickup} days</span>
                </td>
                <td>
                  <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{p.missedCount}×</span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: p.notes ? 'italic' : 'normal' }}>
                  {p.notes || '—'}
                </td>
                {hasActions && (
                  <td>
                    <RowActions entry={p} role={role} onReschedule={onReschedule} onEdit={onEdit} onDelete={onDelete} tabId="atRisk" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-cards">
        {data.map(p => (
          <MobileCard key={p.id} p={p} badge={<span className="badge badge-warning">{p.daysSincePickup}d ago</span>}
            role={role} onReschedule={onReschedule} onEdit={onEdit} onDelete={onDelete} tabId="atRisk" />
        ))}
      </div>
    </>
  )
}

// ── Churned table ─────────────────────────────────────────────────────────────
function ChurnedTable({ data, role, onReschedule, onEdit, onDelete }) {
  if (!data.length) return <EmptySection message="No churned donors. Keep up the great engagement!" />
  const hasActions = role === 'admin' || role === 'manager'
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Donor</th>
              <th>Location</th>
              <th>Last Pickup</th>
              <th>Inactive For</th>
              <th>Reason</th>
              {hasActions && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{p.donorName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{p.mobile}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>
                  <div>{p.society}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.sector}, {p.city}</div>
                </td>
                <td style={{ fontSize: 12.5 }}>{fmtDate(p.lastPickup)}</td>
                <td>
                  <span className="badge badge-muted" style={{ fontSize: 11 }}>{p.daysSincePickup} days</span>
                </td>
                <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{p.reason || '—'}</td>
                {hasActions && (
                  <td>
                    <RowActions entry={p} role={role} onReschedule={onReschedule} onEdit={onEdit} onDelete={onDelete} tabId="churned" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-cards">
        {data.map(p => (
          <MobileCard key={p.id} p={p} badge={<span className="badge badge-muted">{p.daysSincePickup}d inactive</span>}
            role={role} onReschedule={onReschedule} onEdit={onEdit} onDelete={onDelete} tabId="churned" />
        ))}
      </div>
    </>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function EmptySection({ message }) {
  return (
    <div className="empty-state" style={{ padding: 48 }}>
      <p>{message}</p>
    </div>
  )
}

function MobileCard({ p, badge, role, onReschedule, onEdit, onDelete, tabId }) {
  const hasActions = role === 'admin' || role === 'manager'
  return (
    <div className="card" style={{ marginBottom: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.donorName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.mobile}</div>
        </div>
        {badge}
      </div>
      {p.orderId && (
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'var(--primary)', background: 'var(--primary-light)', padding: '1px 6px', borderRadius: 4 }}>
            <Hash size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />{p.orderId}
          </span>
        </div>
      )}
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
        {p.society}, {p.sector}
      </div>
      {(p.timeSlot || p.scheduledDate) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {p.timeSlot || fmtDate(p.scheduledDate)}
        </div>
      )}
      {p.notes && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 4 }}>{p.notes}</div>
      )}
      {hasActions && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
          <RowActions entry={p} role={role} onReschedule={onReschedule} onEdit={onEdit} onDelete={onDelete} tabId={tabId} />
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PickupTabs component
// Props:
//   activeTab       — currently selected tab id
//   onTabChange     — (tabId) => void
//   data            — { overdue, scheduled, atRisk, churned }
//   loading         — bool
//   role            — 'admin' | 'manager' | 'executive' | ''
//   onReschedule    — (entry, { date, timeSlot, notes }) => Promise  (called after modal confirm)
//   onEdit          — (entry) => void
//   onDelete        — (entry) => void
//   // Legacy prop kept for backward-compat (was used before role-based refactor)
//   onRescheduleOverdue — (entry) => void  (ignored when onReschedule is provided)
// ════════════════════════════════════════════════════════════════════════════
export default function PickupTabs({
  activeTab,
  onTabChange,
  data,
  loading,
  role = '',
  onReschedule,
  onEdit,
  onDelete,
  onRescheduleOverdue,  // legacy compat
}) {
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [rescheduleSaving, setRescheduleSaving] = useState(false)
  const [deleteTarget,     setDeleteTarget]     = useState(null)

  const counts = {
    overdue:   data.overdue?.length   ?? 0,
    scheduled: data.scheduled?.length ?? 0,
    atRisk:    data.atRisk?.length    ?? 0,
    churned:   data.churned?.length   ?? 0,
  }

  // ── Handler: open reschedule modal ────────────────────────────────────────
  const handleRescheduleClick = (entry) => setRescheduleTarget(entry)

  // ── Handler: confirm reschedule from modal ────────────────────────────────
  const handleRescheduleConfirm = async (entry, rescheduleData) => {
    setRescheduleSaving(true)
    try {
      if (onReschedule) {
        await onReschedule(entry, rescheduleData)
      } else if (onRescheduleOverdue) {
        // Legacy: navigate to scheduler (backward compat)
        onRescheduleOverdue(entry)
      }
    } finally {
      setRescheduleSaving(false)
      setRescheduleTarget(null)
    }
  }

  // ── Handler: edit pickup ──────────────────────────────────────────────────
  const handleEdit = (entry) => onEdit?.(entry)

  // ── Handler: delete pickup — show confirmation inline ─────────────────────
  const handleDeleteClick  = (entry) => setDeleteTarget(entry)
  const handleDeleteCancel = () => setDeleteTarget(null)
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await onDelete?.(deleteTarget)
    } finally {
      setDeleteTarget(null)
    }
  }

  const tableProps = { role, onReschedule: handleRescheduleClick, onEdit: handleEdit, onDelete: handleDeleteClick }

  return (
    <div>
      {/* ── Tab toggle buttons ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {TABS.map(tab => {
          const Icon     = tab.icon
          const isActive = activeTab === tab.id
          const count    = counts[tab.id]
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 18px', borderRadius: 'var(--radius-sm)',
                border: `1.5px solid ${isActive ? tab.color : 'var(--border)'}`,
                background: isActive ? tab.bg : 'var(--surface)',
                color: isActive ? tab.color : 'var(--text-muted)',
                fontWeight: isActive ? 700 : 500, fontSize: 13,
                cursor: 'pointer', transition: 'all 0.15s',
                fontFamily: 'var(--font-body)',
              }}
            >
              <Icon size={14} />
              {tab.label}
              {count > 0 && (
                <span style={{
                  background: isActive ? tab.color : 'var(--border)',
                  color: isActive ? 'white' : 'var(--text-muted)',
                  fontSize: 10.5, fontWeight: 700,
                  padding: '1px 7px', borderRadius: 20,
                  minWidth: 20, textAlign: 'center',
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Role-based access notice for non-admins/managers ── */}
      {role && role !== 'admin' && role !== 'manager' && (
        <div style={{
          padding: '8px 14px', marginBottom: 14, borderRadius: 8,
          background: 'var(--info-bg)', border: '1px solid rgba(59,130,246,0.2)',
          fontSize: 12, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertTriangle size={13} />
          Viewing in read-only mode. Reschedule and delete actions require Admin or Manager role.
        </div>
      )}

      {/* ── Tab content ── */}
      {loading ? (
        <SkeletonTable />
      ) : (
        <div>
          {activeTab === 'overdue'   && <OverdueTable   data={data.overdue   || []} {...tableProps} />}
          {activeTab === 'scheduled' && <ScheduledTable data={data.scheduled || []} {...tableProps} />}
          {activeTab === 'atRisk'    && <AtRiskTable    data={data.atRisk    || []} {...tableProps} />}
          {activeTab === 'churned'   && <ChurnedTable   data={data.churned   || []} {...tableProps} />}
        </div>
      )}

      {/* ── Reschedule modal ── */}
      {rescheduleTarget && (
        <RescheduleModal
          entry={rescheduleTarget}
          saving={rescheduleSaving}
          onConfirm={handleRescheduleConfirm}
          onClose={() => setRescheduleTarget(null)}
        />
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 14, padding: 28,
            width: 'min(380px, 96vw)', boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={17} color="var(--danger)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Delete Pickup?</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>This action cannot be undone.</div>
              </div>
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: 8, background: 'var(--bg)',
              border: '1px solid var(--border-light)', fontSize: 13, marginBottom: 20,
            }}>
              <strong>{deleteTarget.donorName}</strong>
              {deleteTarget.orderId && <> · <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--primary)' }}>{deleteTarget.orderId}</span></>}
              {deleteTarget.scheduledDate && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{fmtDate(deleteTarget.scheduledDate)}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleDeleteCancel} style={{ flex: 1, height: 38, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleDeleteConfirm} style={{ flex: 1, height: 38, borderRadius: 8, border: 'none', background: 'var(--danger)', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function SkeletonTable() {
  return (
    <div>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{
          height: 52, borderRadius: 8,
          background: 'linear-gradient(90deg, var(--border-light) 25%, var(--bg) 50%, var(--border-light) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite',
          marginBottom: 8,
        }} />
      ))}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>
    </div>
  )
}