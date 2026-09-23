// Frontend/src/pages/PickupScheduler.jsx
// ─── Pickup Scheduler — schedule form only (tabs moved to PickupOverview) ──────
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  CalendarDays, Plus, X, ChevronDown, Check,
  Clock, User, MapPin, FileText, CheckCircle, AlertTriangle,
} from 'lucide-react'
import { useApp }      from '../context/AppContext'
import DonorModal      from '../components/DonorModal'
import { fmtDate }     from '../utils/helpers'
import * as api        from '../services/api'

const ALL_TIME_SLOTS = [
  '9:00 AM – 10:00 AM', '10:00 AM – 11:00 AM',
  '11:00 AM – 12:00 PM', '12:00 PM – 1:00 PM',
  '2:00 PM – 3:00 PM',  '3:00 PM – 4:00 PM',
  '4:00 PM – 5:00 PM',  '5:00 PM – 6:00 PM',
]
const DRIVE_TIME_SLOTS = ['9:00 AM – 12:00 PM', '2:00 PM – 5:00 PM']

function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t) }, [])
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 24, zIndex: 200, background: 'var(--secondary)', color: 'white', padding: '12px 20px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow-lg)', animation: 'slideUp 0.25s ease', fontSize: 13.5, fontWeight: 600 }}>
      <CheckCircle size={16} />{message}
    </div>
  )
}

function DonorDropdown({ donors, value, onChange, onAddNew }) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const ref               = useRef(null)

  const selected = useMemo(() => donors.find(d => d.id === value), [donors, value])
  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return donors.filter(d =>
      d.name.toLowerCase().includes(q) || d.mobile.includes(q) || (d.society || '').toLowerCase().includes(q)
    )
  }, [donors, query])

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const select = (d) => { onChange(d.id); setOpen(false); setQuery('') }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: `1.5px solid ${open ? 'var(--primary)' : 'var(--border)'}`, boxShadow: open ? '0 0 0 3px rgba(232,82,26,0.1)' : 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'var(--surface)', transition: 'all 0.15s' }}>
        <User size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
          {selected ? (
            <span style={{ fontWeight: 600 }}>{selected.name}<span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>{selected.society}, {selected.city}</span></span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Search or select a donor…</span>
          )}
        </div>
        {selected
          ? <X size={14} color="var(--text-muted)" onClick={e => { e.stopPropagation(); onChange('') }} />
          : <ChevronDown size={14} color="var(--text-muted)" />}
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', zIndex: 60, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-light)', position: 'relative' }}>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Type name, mobile, or society…" style={{ paddingLeft: 8, width: '100%', fontSize: 13, border: 'none', outline: 'none', background: 'transparent' }} />
          </div>
          <button onClick={() => { setOpen(false); onAddNew() }} style={{ width: '100%', padding: '10px 14px', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border-light)', background: 'var(--primary-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
            <Plus size={14} /> Add New Donor
          </button>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No donors found. <button onClick={() => { setOpen(false); onAddNew() }} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer' }}>Add new?</button></div>
            ) : filtered.map(d => (
              <div key={d.id} onClick={() => select(d)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)', background: d.id === value ? 'var(--primary-light)' : 'transparent', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s' }} onMouseEnter={e => { if (d.id !== value) e.currentTarget.style.background = 'var(--bg)' }} onMouseLeave={e => { e.currentTarget.style.background = d.id === value ? 'var(--primary-light)' : 'transparent' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--primary)', fontSize: 14, flexShrink: 0 }}>{d.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{d.mobile} · {d.society}, {d.city}</div>
                </div>
                {d.id === value && <Check size={14} color="var(--primary)" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PickupScheduler({ onNav }) {
  const { state } = useLocation()
  const { donors, pickups, addDonor, schedulePickup, updatePickup, dashboardStats, PICKUP_MODES } = useApp()

  const [selectedDonorId, setSelectedDonorId] = useState('')
  const [date,       setDate]       = useState('')
  const [timeSlot,   setTimeSlot]   = useState('')
  const [pickupMode, setPickupMode] = useState('Individual')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')
  const [showDonorModal, setDonorModal] = useState(false)
  const [toast,          setToast]      = useState(null)
  const [targetPickupId,   setTargetPickupId]   = useState(null)
  const [conflictDismissed, setConflictDismissed] = useState(false)
  // serverConflict: async result of the server-side duplicate check (more
  // reliable than client-side when the local pickups list is stale/partial).
  const [serverConflict, setServerConflict] = useState(null)
  const [checkingConflict, setCheckingConflict] = useState(false)

  const activeDonors = useMemo(() => donors.filter(d => d.status !== 'Lost'), [donors])

  // Detect duplicate scheduling: same donor + same date + Pending status (excluding reschedule target)
  const conflictPickup = useMemo(() => {
    if (!selectedDonorId || !date) return null
    return pickups.find(
      p => p.donorId === selectedDonorId &&
           p.date    === date &&
           (p.status === 'Pending' || p.status === 'Scheduled') &&
           p.id !== targetPickupId
    ) || null
  }, [pickups, selectedDonorId, date, targetPickupId])

  // ── Server-side conflict cross-check ─────────────────────────────────────
  // Fires whenever donor or date changes.  Supplements the client-side memo
  // for cases where the local pickups array is paginated / stale.
  useEffect(() => {
    if (!selectedDonorId || !date) {
      setServerConflict(null)
      return
    }
    let cancelled = false
    setCheckingConflict(true)
    api.checkSchedulingConflict(selectedDonorId, date, targetPickupId || undefined)
      .then(res => {
        if (!cancelled) setServerConflict(res?.conflict ? res.pickup : null)
      })
      .catch(() => { /* silent — client-side check still applies */ })
      .finally(() => { if (!cancelled) setCheckingConflict(false) })
    return () => { cancelled = true }
  }, [selectedDonorId, date, targetPickupId])

  const timeSlots    = pickupMode === 'Drive' ? DRIVE_TIME_SLOTS : ALL_TIME_SLOTS

  useEffect(() => {
    if (!state?.pickupId) return
    const existing = pickups.find(p => p.id === state.pickupId)
    if (!existing) return
    setTargetPickupId(existing.id)
    setSelectedDonorId(existing.donorId || state.donorId || '')
    setDate(state.date || existing.date || '')
    setTimeSlot(state.timeSlot || existing.timeSlot || '')
    setPickupMode(state.pickupMode || existing.pickupMode || 'Individual')
    setNotes(state.notes || existing.notes || '')
  }, [state, pickups])

  const handleModeChange = (mode) => { setPickupMode(mode); setTimeSlot('') }

  const handleAddDonor = async (donorData) => {
    // If donorData has an id, DonorModal detected an existing donor/supporter.
    // Auto-select them without calling addDonor (which would create a duplicate).
    if (donorData?.id) {
      setSelectedDonorId(donorData.id)
      setDonorModal(false)
      setToast(`✓ ${donorData.name} selected`)
      return
    }
    // New donor path: create then select
    const newDonor = await addDonor(donorData)
    setSelectedDonorId(newDonor.id)
    setDonorModal(false)
    setToast(`✓ ${newDonor.name} added and selected`)
  }

  const handleSchedule = async () => {
    if (!selectedDonorId) { setFormError('Please select a donor'); return }
    if (!date)            { setFormError('Please pick a pickup date'); return }
    if (!timeSlot)        { setFormError('Please select a time slot'); return }

    // Duplicate-scheduling guard: block submission when an unresolved conflict
    // exists. If user explicitly dismissed the warning (Close), allow it.
    const activeConflict = conflictPickup || serverConflict
    if (activeConflict && !conflictDismissed) {
      setFormError(
        'A pickup is already scheduled for this donor on this date. ' +
        'Pick a different date or click "Close" to proceed anyway.'
      )
      return
    }

    setFormError('')
    setSaving(true)
    try {
      const donor = activeDonors.find(d => d.id === selectedDonorId)
      const payload = {
        donorId: donor.id, donorName: donor.name,
        mobile:  donor.mobile || '', society: donor.society || '',
        sector:  donor.sector || '', city: donor.city || '',
        date, timeSlot, pickupMode, notes,
        status: 'Pending',
      }
      if (targetPickupId) {
        await updatePickup(targetPickupId, payload)
      } else {
        await schedulePickup(payload)
      }
      setSelectedDonorId(''); setDate(''); setTimeSlot(''); setNotes('')
      setTargetPickupId(null)
      setConflictDismissed(false)
      setServerConflict(null)
      setToast(targetPickupId ? 'Pickup rescheduled successfully!' : 'Pickup scheduled successfully!')
    } catch (err) {
      setFormError(err?.message || 'Failed to save pickup. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const donorDetails = useMemo(() => activeDonors.find(d => d.id === selectedDonorId), [activeDonors, selectedDonorId])

  return (
    <div className="page-body">
      <div className="two-col" style={{ alignItems: 'start', marginBottom: 28 }}>
        {/* Schedule Form */}
        <div className="card">
          <div className="card-header">
            <CalendarDays size={18} color="var(--primary)" />
            <div className="card-title">{targetPickupId ? `Reschedule Pickup (${targetPickupId})` : 'Schedule a Pickup'}</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Donor <span className="required">*</span></label>
                <DonorDropdown donors={activeDonors} value={selectedDonorId} onChange={id => { setSelectedDonorId(id); setFormError(''); setConflictDismissed(false); setServerConflict(null) }} onAddNew={() => setDonorModal(true)} />
              </div>

              {donorDetails && (
                <div style={{ padding: '10px 14px', background: 'var(--secondary-light)', borderRadius: 8, fontSize: 12.5, color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MapPin size={13} />
                  {[donorDetails.society, donorDetails.sector, donorDetails.city].filter(Boolean).join(', ')}
                </div>
              )}

              <div className="form-group" style={{ margin: 0 }}>
                <label>Pickup Date <span className="required">*</span></label>
                <div style={{ position: 'relative' }}>
                  <CalendarDays size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => { setDate(e.target.value); setFormError(''); setConflictDismissed(false); setServerConflict(null) }} style={{ paddingLeft: 36 }} />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Pickup Mode</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {PICKUP_MODES.map(mode => (
                    <button key={mode} type="button" onClick={() => handleModeChange(mode)} style={{ flex: 1, padding: '7px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: `1.5px solid ${pickupMode === mode ? 'var(--primary)' : 'var(--border)'}`, background: pickupMode === mode ? 'var(--primary-light)' : 'transparent', color: pickupMode === mode ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: pickupMode === mode ? 700 : 400 }}>
                      {mode}
                    </button>
                  ))}
                </div>
                {pickupMode === 'Drive' && <div style={{ fontSize: 11.5, color: 'var(--info)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} /> Drive: community slots only</div>}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Time Slot <span className="required">*</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {timeSlots.map(slot => (
                    <button key={slot} type="button" onClick={() => { setTimeSlot(slot); setFormError('') }} style={{ padding: '5px 11px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: `1.5px solid ${timeSlot === slot ? 'var(--primary)' : 'var(--border)'}`, background: timeSlot === slot ? 'var(--primary-light)' : 'transparent', color: timeSlot === slot ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: timeSlot === slot ? 700 : 400, transition: 'all 0.12s' }}>
                      <Clock size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />{slot}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Notes <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>(optional)</span></label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instructions for the pickup team…" style={{ minHeight: 68 }} />
              </div>

              {/* ── Scheduling conflict warning ── */}
              {(conflictPickup || serverConflict) && !conflictDismissed && (
                <div style={{
                  padding: '14px 16px', background: '#fff7ed', border: '1.5px solid #fed7aa',
                  borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <AlertTriangle size={16} color="#ea580c" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#9a3412', lineHeight: 1.3 }}>
                        Duplicate Pickup Detected
                      </div>
                      <div style={{ fontSize: 12.5, color: '#c2410c', marginTop: 3, lineHeight: 1.5 }}>
                        This donor already has a pickup scheduled on <strong>{fmtDate(date)}</strong>
                        {(conflictPickup || serverConflict)?.timeSlot ? ` (${(conflictPickup || serverConflict).timeSlot})` : ''} — Order <strong>{(conflictPickup || serverConflict)?.orderId || (conflictPickup || serverConflict)?.id}</strong>.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => { setDate(''); setConflictDismissed(false) }}
                      style={{ flex: 1, padding: '7px 12px', borderRadius: 7, border: '1.5px solid #fed7aa', background: '#fff', color: '#9a3412', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Reschedule to New Date
                    </button>
                    <button
                      type="button"
                      onClick={() => setConflictDismissed(true)}
                      style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#e5e7eb', color: '#6b7280', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}

              {formError && <div style={{ fontSize: 12.5, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>⚠ {formError}</div>}

              <button
                className="btn btn-primary"
                onClick={handleSchedule}
                disabled={saving || checkingConflict}
                style={{ width: '100%', justifyContent: 'center', padding: '10px', opacity: checkingConflict ? 0.75 : 1 }}
              >
                {saving
                  ? <><span className="spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%' }} /> Saving…</>
                  : checkingConflict
                    ? <><span className="spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%' }} /> Checking…</>
                    : <><Plus size={15} /> {targetPickupId ? 'Reschedule Pickup' : 'Schedule Pickup'}</>}
              </button>
            </div>
          </div>
        </div>

        {/* Guide */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-header">
              <FileText size={16} color="var(--info)" />
              <div className="card-title">How to Use</div>
            </div>
            <div className="card-body" style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <p style={{ marginBottom: 8 }}>1. <strong>Search</strong> for a donor or click <span style={{ color: 'var(--primary)', fontWeight: 700 }}>+ Add New Donor</span>.</p>
              <p style={{ marginBottom: 8 }}>2. Pick a <strong>date</strong>, <strong>mode</strong>, and <strong>time slot</strong>.</p>
              <p style={{ marginBottom: 8 }}>3. <strong>Individual</strong> = all slots. <strong>Drive</strong> = 9–12 AM and 2–5 PM only.</p>
              <p style={{ marginBottom: 8 }}>4. Hit <strong>Schedule Pickup</strong>.</p>
              <p>5. View scheduled pickups in <strong>Pickup Overview</strong>.</p>
            </div>
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '10px' }} onClick={() => onNav?.('pickupoverview')}>
            View Pickup Overview →
          </button>
          <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', padding: '10px' }} onClick={() => setDonorModal(true)}>
            <Plus size={15} /> Add New Donor
          </button>
        </div>
      </div>

      {showDonorModal && <DonorModal onClose={() => setDonorModal(false)} onAdd={handleAddDonor} />}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}