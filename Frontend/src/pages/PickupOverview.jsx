// Frontend/src/pages/PickupOverview.jsx
// Admin/Manager: Overview of all pickups — Individual & Drive stats + scheduler tabs
// FIXED: Searchable SectorSearchSelect, dependent city→sector→society hierarchy,
//        city defaults to Gurgaon, scheduler tab defaults to "This Week",
//        responsive filter bar with proper z-index and alignment.
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Truck, Users, AlertTriangle, TrendingUp,
  X, Calendar, BarChart3, ChevronDown, ChevronUp,
  MapPin, Filter,
} from 'lucide-react'
import { useApp }   from '../context/AppContext'
import { useRole }  from '../context/RoleContext'
import PickupTabs   from '../components/PickupTabs'
import { fmtDate, fmtCurrency } from '../utils/helpers'
import SectorSearchSelect from '../components/SectorSearchSelect'

// ── Period helpers ─────────────────────────────────────────────────────────────
const padM = (n) => String(n).padStart(2, '0')

const fmt = (d) => d.toISOString().slice(0, 10)

function getThisMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const from = new Date(y, m, 1)
  const to = new Date(y, m + 1, 0)
  // Keep it aligned with “today” for a tighter range
  to.setHours(0, 0, 0, 0)
  return { from: fmt(from), to: fmt(now) }
}

function getLastMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const lm = m === 0 ? 11 : m - 1
  const ly = m === 0 ? y - 1 : y
  const from = new Date(ly, lm, 1)
  const to = new Date(ly, lm + 1, 0)
  return { from: fmt(from), to: fmt(to) }
}

function getLastQuarterRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const curQ = Math.floor(m / 3) // 0..3
  const lastQ = curQ === 0 ? 3 : curQ - 1
  const lastQuarterYear = curQ === 0 ? y - 1 : y
  const fromMonth = lastQ * 3
  const from = new Date(lastQuarterYear, fromMonth, 1)
  const to = new Date(lastQuarterYear, fromMonth + 3, 0)
  return { from: fmt(from), to: fmt(to) }
}

// ── FIXED: This Week = Monday–Sunday of current week ──────────────────────────
function getThisWeekRange() {
  const now = new Date()
  const day = now.getDay() // 0=Sun … 6=Sat
  const daysSinceMon = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysSinceMon)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: fmt(monday), to: fmt(sunday) }
}

function getPresetRange(p) {
  const n = new Date()
  if (p === 'today')     return { from: fmt(n), to: fmt(n) }
  if (p === 'yesterday') { const d = new Date(n); d.setDate(n.getDate() - 1); return { from: fmt(d), to: fmt(d) } }
  if (p === 'tomorrow')  { const d = new Date(n); d.setDate(n.getDate() + 1); return { from: fmt(d), to: fmt(d) } }
  if (p === 'week')      return getThisWeekRange()
  if (p === 'next7')     { const d = new Date(n); d.setDate(n.getDate() + 7); return { from: fmt(n), to: fmt(d) } }
  return { from: '', to: '' }
}

// Derive initial "This Week" range for the scheduler default
const INITIAL_WEEK = getThisWeekRange()

// ── Stats row ─────────────────────────────────────────────────────────────────
function PickupStatRow({ label, value, sub, color = 'var(--text-primary)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-light)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color }}>{value}</span>
        {sub && <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PickupOverview() {
  const navigate = useNavigate()
  const { pickups, schedulerTabData, CITIES, CITY_SECTORS, locations, upsertLocation, reschedulePickup, deletePickup, createPickup } = useApp()
  const { role } = useRole()

  const last5 = []   // kept for compat; month presets removed
  const defaultFrom = ''
  const defaultTo   = ''

  // ── Section / tab state ────────────────────────────────────────────────────
  const [section,    setSection]   = useState('overview')
  const [activeTab,  setActiveTab] = useState('scheduled')

  // ── Overview filters — city defaults to Gurgaon ───────────────────────────
  // Default overview period = This Month
  const DEFAULT_MONTH_RANGE = useMemo(() => getThisMonthRange(), [])
  const [dateFrom,   setDateFrom]  = useState(DEFAULT_MONTH_RANGE.from)
  const [dateTo,     setDateTo]    = useState(DEFAULT_MONTH_RANGE.to)
  
  const [city,       setCity]      = useState('Gurgaon')   // ← default Gurgaon
  const [sector,     setSector]    = useState('')
  const [society,    setSociety]   = useState('')

  // ── Scheduler filters — default to "This Week" ────────────────────────────
  const [schPreset, setSchPreset] = useState('week')        // ← default week
  const [schFrom,   setSchFrom]   = useState(INITIAL_WEEK.from)
  const [schTo,     setSchTo]     = useState(INITIAL_WEEK.to)

  // ── Derived location options ───────────────────────────────────────────────
  // Sectors for selected city
  const allSectors = useMemo(() => CITY_SECTORS[city] || [], [CITY_SECTORS, city])

  // Societies for selected city + sector
  const allSocieties = useMemo(() => {
    if (!city || !sector) return []
    const fromLocations = locations.sectorSocieties?.[`${city}::${sector}`] || []
    const fromPickups   = [...new Set(
      pickups
        .filter(p => p.city === city && p.sector === sector && p.society)
        .map(p => p.society)
    )].sort()
    // Merge both sources, deduplicate
    return [...new Set([...fromLocations, ...fromPickups])].sort()
  }, [city, sector, locations.sectorSocieties, pickups])

  // ── City change — cascade clear sector & society ──────────────────────────
  const handleCityChange = (val) => {
    setCity(val)
    setSector('')
    setSociety('')
  }

  // ── Sector change — cascade clear society ─────────────────────────────────
  const handleSectorChange = (val) => {
    setSector(val)
    setSociety('')
  }

  // ── Scheduler preset handler ───────────────────────────────────────────────
  const applySchPreset = (p) => {
    setSchPreset(p)
    if (p === 'all') { setSchFrom(''); setSchTo('') }
    else if (p !== 'custom') {
      const r = getPresetRange(p)
      setSchFrom(r.from)
      setSchTo(r.to)
    }
  }

  // ── Action handlers for PickupTabs ──────────────────────────────────────────
  // Reschedule: if real pickup ID → update existing; if synthetic TAB- → create new
  const handleReschedule = async (entry, rescheduleData) => {
    const { date, timeSlot, notes } = rescheduleData
    if (!date) return

    const isSynthetic = !entry.id || String(entry.id).startsWith('TAB-')

    if (isSynthetic) {
      // AtRisk / Churned: no existing pickup — create a new scheduled pickup
      await createPickup({
        donorId:    entry.donorId,
        donorName:  entry.donorName,
        mobile:     entry.mobile || '',
        society:    entry.society || '',
        sector:     entry.sector || '',
        city:       entry.city || '',
        date,
        timeSlot:   timeSlot || '',
        notes:      notes || `Rescheduled from ${activeTab} view`,
        status:     'Pending',
        pickupMode: entry.pickupMode || 'Individual',
      })
    } else {
      // Overdue / Scheduled: update existing pickup record
      await reschedulePickup(entry.id, { date, timeSlot: timeSlot || '', notes })
    }
  }

  // Edit: navigate to PickupScheduler pre-filled with existing pickup data
  const handleEdit = (entry) => {
    navigate('/pickup-scheduler', {
      state: {
        pickupId:   entry.id,
        donorId:    entry.donorId,
        date:       entry.scheduledDate || entry.date || '',
        timeSlot:   entry.timeSlot || '',
        pickupMode: entry.pickupMode || 'Individual',
        notes:      entry.notes || '',
      },
    })
  }

  // Delete: admin only (backend also enforces this)
  const handleDelete = async (entry) => {
    if (!entry.id || String(entry.id).startsWith('TAB-')) return
    await deletePickup(entry.id)
  }

  // Legacy compat — kept in case anything else calls it
  const handleRescheduleFromOverdue = (row) => handleEdit(row)

  // ── Filtered pickups for overview ─────────────────────────────────────────
  const filteredPickups = useMemo(() =>
    pickups.filter(p => {
      const d = p.date || ''
      const inDate   = (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)
      const inCity   = !city   || p.city   === city
      const inSec    = !sector || p.sector === sector
      const inSoc    = !society || p.society === society
      return inDate && inCity && inSec && inSoc
    }),
    [pickups, dateFrom, dateTo, city, sector, society]
  )

  const individualPickups  = useMemo(() => filteredPickups.filter(p => p.pickupMode !== 'Drive'), [filteredPickups])
  const drivePickups       = useMemo(() => filteredPickups.filter(p => p.pickupMode === 'Drive'), [filteredPickups])
  const completedInd       = individualPickups.filter(p => p.status === 'Completed')
  const completedDrive     = drivePickups.filter(p => p.status === 'Completed')
  const indRevenue         = completedInd.reduce((s, p) => s + (p.totalValue || 0), 0)
  const driveRevenue       = completedDrive.reduce((s, p) => s + (p.totalValue || 0), 0)

  const monthlyStats = useMemo(() => {
    const m = {}
    filteredPickups.filter(p => p.status === 'Completed').forEach(p => {
      const key = (p.date || '').slice(0, 7)
      if (!key) return
      if (!m[key]) m[key] = { month: key, individual: 0, drive: 0, revenue: 0 }
      if (p.pickupMode === 'Drive') m[key].drive++
      else m[key].individual++
      m[key].revenue += p.totalValue || 0
    })
    return Object.values(m).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 8)
  }, [filteredPickups])

  // ── Scheduler tab data filtered ───────────────────────────────────────────
  const filteredTabData = useMemo(() => {
    const inRange  = (ds) => { if (!ds) return true; if (schFrom && ds < schFrom) return false; if (schTo && ds > schTo) return false; return true }
    const f        = (rows, dk = 'scheduledDate') => rows.filter(r => inRange(r[dk]))
    return {
      overdue:   f(schedulerTabData.overdue   || []),
      scheduled: f(schedulerTabData.scheduled || []),
      atRisk:    f(schedulerTabData.atRisk    || [], 'lastPickup'),
      churned:   f(schedulerTabData.churned   || [], 'lastPickup'),
    }
  }, [schedulerTabData, schFrom, schTo])

  // ── Period label ──────────────────────────────────────────────────────────
  const periodLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return 'All Time'
    if (dateFrom && dateTo)   return `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`
    if (dateFrom)             return `From ${fmtDate(dateFrom)}`
    return `Until ${fmtDate(dateTo)}`
  }, [dateFrom, dateTo])

  const hasOverviewFilters = !!(sector || society || (city && city !== 'Gurgaon'))

  const resetOverviewFilters = () => {
    setDateFrom(defaultFrom)
    setDateTo(defaultTo)
    setCity('Gurgaon')
    setSector('')
    setSociety('')
  }

  const canViewPickupOverview = role === 'admin' || role === 'manager'
  if (!canViewPickupOverview) {
    return (
      <div className="page-body">
        <div className="empty-state">
          <div className="empty-icon"><AlertTriangle size={24} /></div>
          <h3>Access Restricted</h3>
          <p>Pickup Overview is available to Admin and Manager roles only.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-body">
      {/* ── Section tabs ── */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab ${section === 'overview' ? 'active' : ''}`} onClick={() => setSection('overview')}>
          <BarChart3 size={13} style={{ marginRight: 5 }} />Pickup Analytics
        </button>
        <button className={`tab ${section === 'scheduler' ? 'active' : ''}`} onClick={() => setSection('scheduler')}>
          <Calendar size={13} style={{ marginRight: 5 }} />Scheduler Tabs
        </button>
      </div>

      {/* ══ OVERVIEW SECTION ══════════════════════════════════════════════════ */}
      {section === 'overview' && (
        <>


          {/* ── Compact single-row filter bar ── */}
          <style>{`
            .po-filter-bar { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
            .po-filter-bar input[type="date"],
            .po-filter-bar select { height:32px; padding:0 8px; font-size:12.5px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--surface); color:var(--text-primary); flex-shrink:0; }
            .po-filter-bar input[type="date"] { width:128px; }
            .po-filter-bar .po-city  { width:120px; }
            .po-filter-bar .po-soc   { width:130px; }
            .po-sector-wrap { position:relative; z-index:30; flex-shrink:0; width:160px; }
            .po-divider { width:1px; height:20px; background:var(--border); flex-shrink:0; margin:0 2px; }
            @media(max-width:900px){
              .po-filter-bar input[type="date"]{ width:110px; }
              .po-filter-bar .po-city { width:100px; }
              .po-sector-wrap { width:130px; }
              .po-filter-bar .po-soc { width:110px; }
            }
            @media(max-width:600px){
              .po-filter-bar { gap:5px; }
              .po-filter-bar input[type="date"]{ width:100%; flex:1 1 120px; }
              .po-filter-bar .po-city,.po-filter-bar .po-soc { width:100%; flex:1 1 100px; }
              .po-sector-wrap { width:100%; flex:1 1 130px; }
              .po-divider { display:none; }
            }
          `}</style>

          <div style={{
            marginBottom: 18,
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)',
            padding: '8px 14px',
          }}>
            <div className="po-filter-bar">

              {/* Overview date presets */}
              <button
                className={`btn btn-sm ${dateFrom === getThisMonthRange().from && dateTo === getThisMonthRange().to ? 'btn-primary' : 'btn-ghost'}`}
                style={{ height: 32, fontSize: 12, padding: '0 12px', whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => { const r = getThisMonthRange(); setDateFrom(r.from); setDateTo(r.to) }}
              >
                This month
              </button>

              <button
                className={`btn btn-sm ${dateFrom === getLastMonthRange().from && dateTo === getLastMonthRange().to ? 'btn-primary' : 'btn-ghost'}`}
                style={{ height: 32, fontSize: 12, padding: '0 12px', whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => { const r = getLastMonthRange(); setDateFrom(r.from); setDateTo(r.to) }}
              >
                Last Month
              </button>

              <button
                className={`btn btn-sm ${dateFrom === getLastQuarterRange().from && dateTo === getLastQuarterRange().to ? 'btn-primary' : 'btn-ghost'}`}
                style={{ height: 32, fontSize: 12, padding: '0 12px', whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => { const r = getLastQuarterRange(); setDateFrom(r.from); setDateTo(r.to) }}
              >
                Last Quarter
              </button>

              {/* Date divider */}
              <div className="po-divider" />

              {/* All Time pill */}
              <button
                className={`btn btn-sm ${!dateFrom && !dateTo ? 'btn-primary' : 'btn-ghost'}`}
                style={{ height: 32, fontSize: 12, padding: '0 12px', whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => { setDateFrom(''); setDateTo('') }}
              >
                All Time
              </button>

              {/* Date divider */}
              <div className="po-divider" />

              {/* From date */}
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value) }}
                title="From date"
              />

              {/* Separator */}
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>–</span>

              {/* To date */}
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value) }}
                title="To date"
              />

              {/* Location divider */}
              <div className="po-divider" />

              {/* City */}
              <select
                className="po-city"
                value={city}
                onChange={e => handleCityChange(e.target.value)}
                title="City"
              >
                <option value="">All Cities</option>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>

              {/* Sector — searchable, z-indexed above siblings */}
              <div className="po-sector-wrap">
                <SectorSearchSelect
                  options={allSectors}
                  value={sector}
                  onChange={handleSectorChange}
                  disabled={!city}
                  placeholder={city ? 'Sector…' : '— city first'}
                  onAddOption={async (n) => { if (upsertLocation) await upsertLocation({ city, sector: n }); return n }}
                  addLabel="Add sector"
                />
              </div>

              {/* Society */}
              {allSocieties.length > 0 ? (
                <select
                  className="po-soc"
                  value={society}
                  onChange={e => setSociety(e.target.value)}
                  disabled={!sector}
                  title="Society"
                >
                  <option value="">All Societies</option>
                  {allSocieties.map(s => <option key={s}>{s}</option>)}
                </select>
              ) : (
                <>
                  <input
                    list="po-soc-list"
                    className="po-soc"
                    value={society}
                    onChange={e => setSociety(e.target.value)}
                    placeholder={sector ? 'Society…' : '— sector first'}
                    disabled={!sector}
                    title="Society"
                    style={{ height: 32, padding: '0 8px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text-primary)', flexShrink: 0, width: 130 }}
                  />
                  <datalist id="po-soc-list">{allSocieties.map(s => <option key={s} value={s} />)}</datalist>
                </>
              )}

              {/* Reset — only when something non-default is active */}
              {hasOverviewFilters && (
                <>
                  <div className="po-divider" />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={resetOverviewFilters}
                    title="Reset all filters"
                    style={{ height: 32, padding: '0 10px', color: 'var(--danger)', fontSize: 12, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <X size={12} /> Reset
                  </button>
                </>
              )}

              {/* Period label — pushed right */}
              <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Calendar size={11} color="var(--primary)" />
                {periodLabel}
                {sector && (
                  <span style={{ fontSize: 10.5, padding: '1px 8px', borderRadius: 20, background: 'var(--secondary-light)', color: 'var(--secondary)', fontWeight: 600 }}>
                    {sector}
                  </span>
                )}
                {society && (
                  <span style={{ fontSize: 10.5, padding: '1px 8px', borderRadius: 20, background: 'var(--warning-bg)', color: '#92400E', fontWeight: 600 }}>
                    {society}
                  </span>
                )}
              </span>

            </div>
          </div>

          {/* ── KPIs ── */}
          <div className="stat-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card orange">
              <div className="stat-icon"><Truck size={18} /></div>
              <div className="stat-value">{completedInd.length}</div>
              <div className="stat-label">Individual Pickups</div>
            </div>
            <div className="stat-card blue">
              <div className="stat-icon"><Users size={18} /></div>
              <div className="stat-value">{completedDrive.length}</div>
              <div className="stat-label">Drive Pickups</div>
            </div>
            <div className="stat-card green">
              <div className="stat-icon"><TrendingUp size={18} /></div>
              <div className="stat-value">{fmtCurrency(indRevenue)}</div>
              <div className="stat-label">Individual Revenue</div>
            </div>
            <div className="stat-card yellow">
              <div className="stat-icon"><TrendingUp size={18} /></div>
              <div className="stat-value">{fmtCurrency(driveRevenue)}</div>
              <div className="stat-label">Drive Revenue</div>
            </div>
          </div>

          {/* ── Stats cards ── */}
          <div className="two-col" style={{ marginBottom: 24 }}>
            <div className="card">
              <div className="card-header">
                <Truck size={16} color="var(--primary)" />
                <div className="card-title">Individual Pickup Stats</div>
              </div>
              <div className="card-body">
                <PickupStatRow label="Completed"           value={completedInd.length}       color="var(--secondary)" />
                <PickupStatRow label="Total Revenue"       value={fmtCurrency(indRevenue)}    color="var(--primary)" />
                <PickupStatRow label="Avg Revenue/Pickup"  value={completedInd.length ? fmtCurrency(Math.round(indRevenue / completedInd.length)) : '—'} />
                <PickupStatRow label="Postponed"           value={individualPickups.filter(p => p.status === 'Postponed').length} />
                <PickupStatRow label="RST Pickups"         value={completedInd.filter(p => p.type?.includes('RST')).length} />
                <PickupStatRow label="SKS Pickups"         value={completedInd.filter(p => p.type?.includes('SKS')).length} />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <Users size={16} color="var(--info)" />
                <div className="card-title">Drive / Campaign Stats</div>
              </div>
              <div className="card-body">
                <PickupStatRow label="Completed"           value={completedDrive.length}      color="var(--secondary)" />
                <PickupStatRow label="Total Revenue"       value={fmtCurrency(driveRevenue)}  color="var(--primary)" />
                <PickupStatRow label="Avg Revenue/Drive"   value={completedDrive.length ? fmtCurrency(Math.round(driveRevenue / completedDrive.length)) : '—'} />
                <PickupStatRow label="SKS Drives"          value={completedDrive.filter(p => p.type?.includes('SKS')).length} />
                <PickupStatRow label="RST+SKS Combo"       value={completedDrive.filter(p => p.type === 'RST+SKS').length} />
              </div>
            </div>
          </div>

          {/* ── Monthly breakdown ── */}
          <div className="card">
            <div className="card-header">
              <BarChart3 size={16} color="var(--secondary)" />
              <div className="card-title">Monthly Pickup Breakdown</div>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel}</span>
            </div>
            <div className="table-wrap" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr><th>Month</th><th>Individual</th><th>Drive</th><th>Total</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  {monthlyStats.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No completed pickups in selected period</td></tr>
                  ) : monthlyStats.map(m => (
                    <tr key={m.month}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{m.month}</td>
                      <td style={{ fontWeight: 600 }}>{m.individual}</td>
                      <td style={{ fontWeight: 600 }}>{m.drive}</td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{m.individual + m.drive}</td>
                      <td style={{ fontWeight: 700, color: 'var(--secondary)' }}>{fmtCurrency(m.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ══ SCHEDULER TABS SECTION ══════════════════════════════════════════ */}
      {section === 'scheduler' && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="card-title">Scheduled &amp; At-Risk Pickups</div>
          </div>

          {/* ── Date filter row ── */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-light)',
            background: 'var(--bg)',
          }}>
            {/* Preset buttons */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <Filter size={11} color="var(--primary)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Date:</span>
              {[
                ['today',     'Today'],
                ['yesterday', 'Yesterday'],
                ['tomorrow',  'Tomorrow'],
                ['week',      'This Week'],
                ['next7',     'Next 7 Days'],
                ['all',       'All'],
                ['custom',    'Custom'],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={`btn btn-sm ${schPreset === v ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => applySchPreset(v)}
                  style={{ fontSize: 12, padding: '4px 10px', whiteSpace: 'nowrap' }}
                >
                  {l}
                </button>
              ))}
              {schPreset !== 'all' && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => applySchPreset('all')}
                  style={{ color: 'var(--danger)', fontSize: 11.5, padding: '4px 8px' }}
                >
                  <X size={11} /> Clear
                </button>
              )}
            </div>

            {/* Custom range pickers */}
            {schPreset === 'custom' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                <input type="date" value={schFrom} onChange={e => setSchFrom(e.target.value)} style={{ width: 150, fontSize: 12 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                <input type="date" value={schTo}   onChange={e => setSchTo(e.target.value)}   style={{ width: 150, fontSize: 12 }} />
              </div>
            )}

            {/* Active range label */}
            {schPreset !== 'all' && schFrom && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11.5, color: 'var(--info)', fontWeight: 600 }}>
                <Calendar size={12} />
                {fmtDate(schFrom)}{schTo && schTo !== schFrom ? ` – ${fmtDate(schTo)}` : ''}
                {schPreset === 'week' && ' (Mon – Sun)'}
              </div>
            )}
          </div>

          <div className="card-body">
            <PickupTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              data={filteredTabData}
              loading={false}
              role={role}
              onReschedule={handleReschedule}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </div>
        </div>
      )}
    </div>
  )
}