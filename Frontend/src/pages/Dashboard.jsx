// Frontend/src/pages/Dashboard.jsx
// Fully backend-driven: all stats, charts, and breakdowns come from the API.
// Filters are sent to the backend via fetchDashboardStats — no local computation.
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Users, Truck, IndianRupee, TrendingUp,
  Weight, CalendarDays, CalendarDays as CalDays,
  UserCheck, PackageCheck, AlertCircle, CheckCircle,
  Filter, X, RefreshCw, ArrowUpCircle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { useApp } from '../context/AppContext'
import { fmtCurrency } from '../utils/helpers'

const RST_PIE_COLORS  = ['#E8521A','#1B5E35','#F5B942','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#F97316','#84CC16','#EF4444']
const SKS_PIE_COLORS  = ['#3B82F6','#8B5CF6','#F5B942','#1B5E35','#EC4899','#14B8A6','#F97316','#E8521A','#84CC16','#06B6D4','#A78BFA','#FB923C','#4ADE80','#F472B6']

const padM = (n) => String(n).padStart(2, '0')

// ── Period → date range ────────────────────────────────────────────────────────
function getPeriodRange(type, customFrom, customTo) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  if (type === 'current_month') {
    const last = new Date(y, m + 1, 0).getDate()
    return { from: `${y}-${padM(m + 1)}-01`, to: `${y}-${padM(m + 1)}-${padM(last)}` }
  }
  if (type === 'last_month') {
    const lm = m === 0 ? 11 : m - 1; const ly = m === 0 ? y - 1 : y
    const last = new Date(ly, lm + 1, 0).getDate()
    return { from: `${ly}-${padM(lm + 1)}-01`, to: `${ly}-${padM(lm + 1)}-${padM(last)}` }
  }
  if (type === 'last_quarter') {
    const curQStart = Math.floor(m / 3) * 3
    let lqStart = curQStart - 3; let lqYear = y
    if (lqStart < 0) { lqStart += 12; lqYear = y - 1 }
    const lqEnd  = lqStart + 2
    const lqLast = new Date(lqYear, lqEnd + 1, 0).getDate()
    return { from: `${lqYear}-${padM(lqStart + 1)}-01`, to: `${lqYear}-${padM(lqEnd + 1)}-${padM(lqLast)}` }
  }
  if (type === 'all_time') return { from: '', to: '' }
  if (type === 'custom') return { from: customFrom || '', to: customTo || '' }
  return { from: '', to: '' }
}

// ── Compact Filters Bar ────────────────────────────────────────────────────────
function FiltersPanel({ filters, onChange, partnerNames, CITIES = [], CITY_SECTORS = {} }) {
  const { period, customFrom, customTo, city, sector, partnerId } = filters
  const PERIOD_OPTIONS = [
    { id: 'current_month', label: 'This Month' },
    { id: 'last_month',    label: 'Last Month' },
    { id: 'last_quarter',  label: 'Last Quarter' },
    { id: 'all_time',      label: 'All Time' },
    { id: 'custom',        label: 'Custom' },
  ]
  const sectorOptions = city ? (CITY_SECTORS[city] || []) : []
  const hasLocFilter = city || sector || partnerId

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius)', padding: '8px 12px',
      marginBottom: 14, boxShadow: 'var(--shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap', overflowX: 'auto' }}>
        <Filter size={12} color="var(--primary)" style={{ flexShrink: 0 }} />

        {PERIOD_OPTIONS.map(o => (
          <button key={o.id} className={`btn btn-sm ${period === o.id ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 11, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => onChange({ ...filters, period: o.id })}>
            {o.label}
          </button>
        ))}

        <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0, marginLeft: 'auto' }} />

        <select value={city} onChange={e => onChange({ ...filters, city: e.target.value, sector: '' })}
          style={{ fontSize: 11, padding: '2px 4px', width: 'auto', minWidth: 0, maxWidth: 100, height: 26, flexShrink: 0 }}>
          <option value="">All Cities</option>
          {CITIES.map(c => <option key={c}>{c}</option>)}
        </select>

        <select value={sector} onChange={e => onChange({ ...filters, sector: e.target.value })}
          disabled={!city}
          style={{ fontSize: 11, padding: '2px 4px', width: 'auto', minWidth: 0, maxWidth: 110, height: 26, flexShrink: 0 }}>
          <option value="">{city ? 'All Sectors' : '—'}</option>
          {sectorOptions.map(s => <option key={s}>{s}</option>)}
        </select>

        <select value={partnerId} onChange={e => onChange({ ...filters, partnerId: e.target.value })}
          style={{ fontSize: 11, padding: '2px 4px', width: 'auto', minWidth: 0, maxWidth: 110, height: 26, flexShrink: 0 }}>
          <option value="">All Partners</option>
          {partnerNames.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>

        {hasLocFilter && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10.5, color: 'var(--danger)', padding: '3px 6px', flexShrink: 0 }}
            onClick={() => onChange({ ...filters, city: '', sector: '', partnerId: '' })}>
            <X size={10} />
          </button>
        )}
        <button className="btn btn-ghost btn-sm"
          style={{ fontSize: 10.5, padding: '3px 7px', flexShrink: 0 }}
          onClick={() => onChange({ period: 'current_month', customFrom: '', customTo: '', city: '', sector: '', partnerId: '' })}>
          <RefreshCw size={10} />
        </button>
      </div>

      {period === 'custom' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>From:</span>
          <input type="date" value={customFrom} onChange={e => onChange({ ...filters, customFrom: e.target.value })} style={{ width: 130, fontSize: 12, height: 28 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>To:</span>
          <input type="date" value={customTo} onChange={e => onChange({ ...filters, customTo: e.target.value })} style={{ width: 130, fontSize: 12, height: 28 }} />
        </div>
      )}
    </div>
  )
}

// ── Custom Pie Label ───────────────────────────────────────────────────────────
const RADIAN = Math.PI / 180
function CustomPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.05) return null
  const r  = innerRadius + (outerRadius - innerRadius) * 0.5
  const x  = cx + r * Math.cos(-midAngle * RADIAN)
  const y  = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 11, fontWeight: 700 }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

// ── RST Item Breakdown — uses backend-computed data ────────────────────────────
function RSTBreakdown({ rstBreakdown = [] }) {
  if (!rstBreakdown || rstBreakdown.length === 0) return (
    <div className="empty-state" style={{ padding: 32 }}>
      <p style={{ fontSize: 12 }}>No RST item data for this period.</p>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {rstBreakdown.length} item types</span>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie data={rstBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%"
              outerRadius={75} innerRadius={28} labelLine={false} label={CustomPieLabel}>
              {rstBreakdown.map((_, i) => <Cell key={i} fill={RST_PIE_COLORS[i % RST_PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => [`${v}`, '']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ flex: 1, minWidth: 150 }}>
          {rstBreakdown.slice(0, 8).map((item, i) => (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: RST_PIE_COLORS[i % RST_PIE_COLORS.length], flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }} className="truncate">{item.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>{item.pct}%</div>
            </div>
          ))}
          {rstBreakdown.length > 8 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>+{rstBreakdown.length - 8} more</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── SKS Item Breakdown — uses backend-computed data ────────────────────────────
function SKSBreakdown({ sksBreakdown = [] }) {
  if (!sksBreakdown || sksBreakdown.length === 0) return (
    <div className="empty-state" style={{ padding: 32 }}>
      <p style={{ fontSize: 12 }}>No SKS item data for this period.</p>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {sksBreakdown.length} item types</span>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie data={sksBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%"
              outerRadius={75} innerRadius={28} labelLine={false} label={CustomPieLabel}>
              {sksBreakdown.map((_, i) => <Cell key={i} fill={SKS_PIE_COLORS[i % SKS_PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => [`${v}`, '']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ flex: 1, minWidth: 150 }}>
          {sksBreakdown.slice(0, 8).map((item, i) => (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: SKS_PIE_COLORS[i % SKS_PIE_COLORS.length], flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }} className="truncate">{item.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>{item.pct}%</div>
            </div>
          ))}
          {sksBreakdown.length > 8 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>+{sksBreakdown.length - 8} more</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── RST Financial Summary — uses backend-computed data ─────────────────────────
function RSTFinancialSummary({ rstFinancialSummary = {} }) {
  const {
    totalRevenue = 0,
    totalReceived = 0,
    totalPending = 0,
    collectionPct = 0,
    partnerBreakdown = [],
  } = rstFinancialSummary

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
          <span style={{ color: 'var(--text-muted)' }}>Collection progress</span>
          <span style={{ color: collectionPct >= 80 ? 'var(--secondary)' : collectionPct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{collectionPct}%</span>
        </div>
        <div style={{ height: 7, background: 'var(--border-light)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 4, width: `${Math.min(100, collectionPct)}%`, background: collectionPct >= 80 ? 'var(--secondary)' : collectionPct >= 50 ? 'var(--warning)' : 'var(--danger)', transition: 'width 0.5s ease' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border-light)', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
        {[
          { label: 'Total Revenue', val: fmtCurrency(totalRevenue), color: 'var(--primary)', bg: 'var(--primary-light)' },
          { label: 'Collected', val: fmtCurrency(totalReceived), color: 'var(--secondary)', bg: 'var(--secondary-light)' },
          { label: 'Pending', val: fmtCurrency(totalPending), color: totalPending > 0 ? 'var(--danger)' : 'var(--secondary)', bg: totalPending > 0 ? 'var(--danger-bg)' : 'var(--secondary-light)' },
        ].map(item => (
          <div key={item.label} style={{ padding: '10px 12px', background: item.bg, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: item.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8, marginBottom: 3 }}>{item.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: item.color }}>{item.val}</div>
          </div>
        ))}
      </div>
      {partnerBreakdown.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>By Pickup Partner</div>
          {partnerBreakdown.slice(0, 5).map(p => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: p.pending > 0 ? 'var(--danger-bg)' : 'var(--secondary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: p.pending > 0 ? 'var(--danger)' : 'var(--secondary)', flexShrink: 0 }}>
                {p.name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }} className="truncate">{p.name}</div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                  <span style={{ color: 'var(--secondary)', fontWeight: 600 }}>{fmtCurrency(p.received)}</span>
                  {p.pending > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Due: {fmtCurrency(p.pending)}</span>}
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>{fmtCurrency(p.total)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── SKS Dispatch Summary — uses backend-computed data ─────────────────────────
function SKSDispatchSummary({ sksDispatchSummary = {} }) {
  const {
    totalDispatched = 0,
    totalReceived = 0,
    totalValue = 0,
    dispatches = 0,
    collectionPct = 0,
    recipientBreakdown = [],
  } = sksDispatchSummary

  if (dispatches === 0) return (
    <div className="empty-state" style={{ padding: 32 }}>
      <p style={{ fontSize: 12 }}>No SKS dispatch data for this period.</p>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border-light)', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
        {[
          { label: 'Total Dispatched', val: `${totalDispatched} items`, color: 'var(--info)', bg: 'var(--info-bg)' },
          { label: 'Payments In', val: fmtCurrency(totalReceived), color: 'var(--secondary)', bg: 'var(--secondary-light)' },
          { label: 'Dispatches', val: String(dispatches), color: 'var(--primary)', bg: 'var(--primary-light)' },
        ].map(item => (
          <div key={item.label} style={{ padding: '10px 12px', background: item.bg, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: item.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8, marginBottom: 3 }}>{item.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: item.color }}>{item.val}</div>
          </div>
        ))}
      </div>
      {totalValue > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
            <span style={{ color: 'var(--text-muted)' }}>Payment collection</span>
            <span style={{ color: collectionPct >= 80 ? 'var(--secondary)' : 'var(--warning)' }}>{collectionPct}%</span>
          </div>
          <div style={{ height: 7, background: 'var(--border-light)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, width: `${Math.min(100, collectionPct)}%`, background: collectionPct >= 80 ? 'var(--secondary)' : 'var(--warning)', transition: 'width 0.5s ease' }} />
          </div>
        </div>
      )}
      {recipientBreakdown.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Top Recipients</div>
          {recipientBreakdown.map(r => (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: 'var(--info)', flexShrink: 0 }}>
                {r.name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }} className="truncate">{r.name}</div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.items} items</span>
              </div>
              {r.received > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--secondary)', flexShrink: 0 }}>{fmtCurrency(r.received)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section Header ─────────────────────────────────────────────────────────────
function SectionHeader({ emoji, title, subtitle, color = 'var(--primary)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, marginTop: 8 }}>
      <div style={{ width: 4, height: 22, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 15, fontWeight: 800, color }}>{emoji} {title}</span>
      {subtitle && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>— {subtitle}</span>}
      <div style={{ flex: 1, height: 1, background: 'var(--border-light)', marginLeft: 4 }} />
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────────
function ChartSkeleton({ height = 180 }) {
  return (
    <div style={{ height, borderRadius: 8, background: 'linear-gradient(90deg, var(--border-light) 25%, var(--bg) 50%, var(--border-light) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD — all data fetched from backend, filters sent as query params
// ════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const {
    donors,
    PickupPartners,
    // Initial (unfiltered) data from AppContext global fetch
    dashboardStats:      ctxStats,
    monthlyRSTChart:     ctxMonthlyRST,
    monthlySKSChart:     ctxMonthlySKS,
    rstBreakdown:        ctxRSTBreakdown,
    sksBreakdown:        ctxSKSBreakdown,
    rstFinancialSummary: ctxRSTFinancial,
    sksDispatchSummary:  ctxSKSDispatch,
    CITIES,
    CITY_SECTORS,
    // API call for filtered stats
    fetchDashboardStats,
  } = useApp()

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState({
    period: 'current_month', customFrom: '', customTo: '',
    city: '', sector: '', partnerId: '',
  })

  // ── Filtered dashboard data (backend response) ──────────────────────────────
  const [filteredData, setFilteredData] = useState(null)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')

  // Debounce ref so rapid filter changes don't flood the API
  const debounceRef = useRef(null)
  const requestSeqRef = useRef(0)

  const { from: pFrom, to: pTo } = useMemo(
    () => getPeriodRange(filters.period, filters.customFrom, filters.customTo),
    [filters.period, filters.customFrom, filters.customTo]
  )

  // Build filter params to send to backend
  const apiFilters = useMemo(() => ({
    dateFrom:  pFrom || undefined,
    dateTo:    pTo   || undefined,
    city:      filters.city      || undefined,
    sector:    filters.sector    || undefined,
    partnerId: filters.partnerId || undefined,
    limit:     2000,
  }), [pFrom, pTo, filters.city, filters.sector, filters.partnerId])

  // ── Fetch from backend whenever filters change ───────────────────────────────
  const loadFilteredStats = useCallback(async (params, options = {}) => {
    const requestId = ++requestSeqRef.current
    setFetching(true)
    setFetchError('')
    try {
      const data = await fetchDashboardStats(params, options)
      if (requestId !== requestSeqRef.current) return
      setFilteredData(data)
    } catch (err) {
      if (requestId !== requestSeqRef.current) return
      setFetchError(err.message || 'Failed to load dashboard data')
      setFilteredData(null)
    } finally {
      if (requestId === requestSeqRef.current) setFetching(false)
    }
  }, [fetchDashboardStats])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      loadFilteredStats(apiFilters, { force: true })
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [apiFilters, loadFilteredStats])

  // ── Resolve which dataset to use (filtered vs context default) ───────────────
  const data = filteredData || {
    stats:               ctxStats,
    monthlyRSTChart:     ctxMonthlyRST,
    monthlySKSChart:     ctxMonthlySKS,
    rstBreakdown:        ctxRSTBreakdown,
    sksBreakdown:        ctxSKSBreakdown,
    rstFinancialSummary: ctxRSTFinancial,
    sksDispatchSummary:  ctxSKSDispatch,
  }

  const stats               = data.stats               || {}
  const monthlyRSTData      = data.monthlyRSTChart     || []
  const monthlySKSData      = data.monthlySKSChart     || []
  const rstBreakdown        = data.rstBreakdown        || []
  const sksBreakdown        = data.sksBreakdown        || []
  const rstFinancialSummary = data.rstFinancialSummary || {}
  const sksDispatchSummary  = data.sksDispatchSummary  || {}

  // Partner list for filter dropdown (ID + name)
  const partnerNames = useMemo(() =>
    (PickupPartners || []).map(p => ({ id: p.id, name: p.name })).filter(p => p.name),
    [PickupPartners]
  )

  const activeFilters = [filters.city, filters.sector, filters.partnerId].filter(Boolean)

  const periodLabel = useMemo(() => {
    if (filters.period === 'current_month') return 'This Month'
    if (filters.period === 'last_month')    return 'Last Month'
    if (filters.period === 'last_quarter')  return 'Last Quarter'
    if (filters.period === 'all_time')      return 'All Time'
    if (filters.period === 'custom' && pFrom && pTo) {
      const fmt = d => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      return `${fmt(pFrom)} – ${fmt(pTo)}`
    }
    return 'Custom'
  }, [filters.period, pFrom, pTo])

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div style={{ color: 'var(--primary)' }}>₹{(payload[0]?.value || 0).toLocaleString('en-IN')}</div>
      </div>
    )
  }
  const SKSTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div style={{ color: 'var(--info)' }}>{payload[0]?.value || 0} items</div>
      </div>
    )
  }

  return (
    <div className="page-body">
      {/* ── Filters ── */}
      <FiltersPanel
        filters={filters}
        onChange={setFilters}
        partnerNames={partnerNames}
        CITIES={CITIES}
        CITY_SECTORS={CITY_SECTORS}
      />

      {/* ── Active filter chips ── */}
      {activeFilters.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Active:</span>
          {filters.city && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '2px 9px', borderRadius: 20, background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 600 }}>
              📍 {filters.city}
              <button onClick={() => setFilters(f => ({ ...f, city: '', sector: '' }))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 0 }}>×</button>
            </span>
          )}
          {filters.sector && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '2px 9px', borderRadius: 20, background: 'var(--info-bg)', color: 'var(--info)', fontWeight: 600 }}>
              🏘 {filters.sector}
              <button onClick={() => setFilters(f => ({ ...f, sector: '' }))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--info)', padding: 0 }}>×</button>
            </span>
          )}
          {filters.partnerId && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '2px 9px', borderRadius: 20, background: 'var(--secondary-light)', color: 'var(--secondary)', fontWeight: 600 }}>
              🤝 {partnerNames.find(p => p.id === filters.partnerId)?.name || filters.partnerId}
              <button onClick={() => setFilters(f => ({ ...f, partnerId: '' }))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--secondary)', padding: 0 }}>×</button>
            </span>
          )}
        </div>
      )}

      {/* ── Period label + fetch indicator ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <CalendarDays size={14} color="var(--primary)" />
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>{periodLabel}</span>
        {fetching && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="spin" style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
            Updating…
          </span>
        )}
        {fetchError && (
          <span style={{ fontSize: 11, color: 'var(--danger)', marginLeft: 8 }}>⚠ {fetchError}</span>
        )}
        {activeFilters.length > 0 && (
          <span style={{ fontSize: 11, background: 'var(--warning-bg)', color: '#92400E', padding: '2px 8px', borderRadius: 20, fontWeight: 600, marginLeft: 'auto' }}>
            Filtered view
          </span>
        )}
      </div>

      {/* ── Compact KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 22 }}>
        {[
          { label: 'Total Pickups',  value: stats.totalPickupsCompleted || 0,                 sub: periodLabel,        icon: Truck,        tone: 'orange' },
          { label: 'RST Revenue',    value: fmtCurrency(stats.totalRSTValue || 0),             sub: periodLabel,        icon: IndianRupee,  tone: 'green'  },
          { label: 'RST Collected',  value: `${(stats.totalRaddiKg || 0).toFixed(1)} kg`,      sub: 'weight',           icon: Weight,       tone: 'blue'   },
          { label: 'SKS Items',      value: stats.totalSKSItems || 0,                          sub: `${stats.totalSKSPickups || 0} pickups`, icon: PackageCheck, tone: 'yellow' },
          { label: 'Received',       value: fmtCurrency(stats.amountReceived || 0),            sub: periodLabel,        icon: CheckCircle,  tone: 'green'  },
          { label: 'Pending',        value: fmtCurrency(stats.pendingFromPickupPartners || 0), sub: 'Needs collection', icon: AlertCircle,  tone: 'red'    },
          { label: 'Active Donors',  value: stats.activeDonors || donors.filter(d => d.status === 'Active').length, sub: `${stats.totalDonors || donors.length} total`, icon: Users, tone: 'blue' },
          { label: 'Partners',       value: (PickupPartners || []).length,                     sub: 'registered',       icon: UserCheck,    tone: 'orange' },
        ].map(item => {
          const StatIcon = item.icon
          return (
            <div key={item.label} className={`stat-card ${item.tone}`} style={{ padding: '12px 12px', opacity: fetching ? 0.75 : 1, transition: 'opacity 0.2s' }}>
              <div className="stat-icon" style={{ width: 32, height: 32, borderRadius: 8 }}><StatIcon size={16} /></div>
              <div className="stat-value" style={{ fontSize: 18 }}>{item.value}</div>
              <div className="stat-label" style={{ fontSize: 10.5 }}>{item.label}</div>
              <div className="stat-change up" style={{ fontSize: 10 }}>{item.sub}</div>
            </div>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════
          ♻️ RST SECTION
      ══════════════════════════════════════════════ */}
      <SectionHeader emoji="♻️" title="RST — Raddi Se Tarakki" subtitle="Scrap collection revenue & item analytics" color="var(--primary)" />

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <TrendingUp size={16} color="var(--primary)" />
            <div className="card-title">Monthly RST Revenue</div>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel}</span>
          </div>
          <div className="card-body" style={{ paddingTop: 10 }}>
            {fetching ? <ChartSkeleton /> : monthlyRSTData.length === 0 ? (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No RST pickups in this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthlyRSTData} barSize={26}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <Weight size={16} color="var(--secondary)" />
            <div className="card-title">RST Item Breakdown</div>
          </div>
          <div className="card-body" style={{ paddingTop: 10 }}>
            {fetching ? <ChartSkeleton height={160} /> : (
              <RSTBreakdown rstBreakdown={rstBreakdown} />
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <IndianRupee size={16} color="var(--primary)" />
          <div className="card-title">RST Financial Insights</div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel}</span>
        </div>
        <div className="card-body" style={{ paddingTop: 10 }}>
          {fetching ? <ChartSkeleton height={120} /> : (
            <RSTFinancialSummary rstFinancialSummary={rstFinancialSummary} />
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          🎁 SKS SECTION
      ══════════════════════════════════════════════ */}
      <SectionHeader emoji="🎁" title="SKS — Sammaan Ka Saaman" subtitle="Goods collection & dispatch analytics" color="var(--info)" />

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <TrendingUp size={16} color="var(--info)" />
            <div className="card-title">Monthly SKS Items Collected</div>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel}</span>
          </div>
          <div className="card-body" style={{ paddingTop: 10 }}>
            {fetching ? <ChartSkeleton /> : monthlySKSData.length === 0 ? (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No SKS items in this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthlySKSData} barSize={26}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<SKSTooltip />} />
                  <Bar dataKey="items" fill="var(--info)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <PackageCheck size={16} color="var(--info)" />
            <div className="card-title">SKS Item Breakdown</div>
          </div>
          <div className="card-body" style={{ paddingTop: 10 }}>
            {fetching ? <ChartSkeleton height={160} /> : (
              <SKSBreakdown sksBreakdown={sksBreakdown} />
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <ArrowUpCircle size={16} color="var(--info)" />
          <div className="card-title">SKS Dispatch & Payment Analytics</div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel}</span>
        </div>
        <div className="card-body" style={{ paddingTop: 10 }}>
          {fetching ? <ChartSkeleton height={100} /> : (
            <SKSDispatchSummary sksDispatchSummary={sksDispatchSummary} />
          )}
        </div>
      </div>
    </div>
  )
}
