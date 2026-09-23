/**
 * RaddiMaster.jsx — Admin-only master data sheet
 * Fetches data directly via fetchFilteredRaddiRecords (backend-paginated).
 * raddiRecords is no longer kept in AppContext; this page owns its data lifecycle.
 */
import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Search, SlidersHorizontal, X, Download,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Weight, IndianRupee, Package,
  Hash, CheckCircle, Clock, AlertCircle,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtDate, fmtCurrency, exportToExcel } from '../utils/helpers'

const PAGE_SIZE = 20

const PAYMENT_BADGE = {
  'Received':       { bg: 'var(--secondary-light)', color: 'var(--secondary)', dot: 'var(--secondary)' },
  'Yet to Receive': { bg: 'var(--warning-bg)',       color: '#92400E',          dot: 'var(--warning)' },
  'Write-off':      { bg: 'var(--danger-bg)',        color: 'var(--danger)',    dot: 'var(--danger)' },
}
const ORDER_BADGE = {
  'Completed': { bg: 'var(--secondary-light)', color: 'var(--secondary)' },
  'Pending':   { bg: 'var(--info-bg)',          color: 'var(--info)' },
  'Postponed': { bg: 'var(--warning-bg)',       color: '#92400E' },
  'Cancelled': { bg: 'var(--danger-bg)',        color: 'var(--danger)' },
}
const DONOR_STATUS_BADGE = {
  'Active':     { bg: 'var(--secondary-light)', color: 'var(--secondary)' },
  'Pickup Due': { bg: 'var(--info-bg)',          color: 'var(--info)' },
  'At Risk':    { bg: 'var(--warning-bg)',       color: '#92400E' },
  'Churned':    { bg: 'var(--danger-bg)',        color: 'var(--danger)' },
}

function Badge({ label, cfg }) {
  const c = cfg || { bg: 'var(--border-light)', color: 'var(--text-muted)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      background: c.bg, color: c.color,
    }}>
      {c.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />}
      {label}
    </span>
  )
}

function getPresetRange(preset) {
  const t = new Date()
  const fmt = d => d.toISOString().slice(0, 10)
  if (preset === 'today') return { from: fmt(t), to: fmt(t) }
  if (preset === 'last7') { const d = new Date(t); d.setDate(d.getDate() - 7); return { from: fmt(d), to: fmt(t) } }
  if (preset === 'month') return { from: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`, to: fmt(t) }
  if (preset === 'last_month') {
    const lm = t.getMonth() === 0 ? 11 : t.getMonth() - 1
    const ly = t.getMonth() === 0 ? t.getFullYear() - 1 : t.getFullYear()
    const last = new Date(ly, lm + 1, 0).getDate()
    const mm = String(lm + 1).padStart(2, '0')
    return { from: `${ly}-${mm}-01`, to: `${ly}-${mm}-${String(last).padStart(2, '0')}` }
  }
  return { from: '', to: '' }
}

function RowDetail({ record }) {
  const rstItems     = record.rstItems     || []
  const sksItems     = record.sksItems     || []
  const itemKgMap    = record.itemKgMap    || {}
  const pickuppartnerRateChart = record.pickuppartnerRateChart || {}
  const rstOthers    = record.rstOthers    || []
  const paid      = record.amountPaid   || 0
  const total     = record.totalAmount  || 0
  const remaining = Math.max(0, total - paid)
  const collPct   = total > 0 ? Math.round((paid / total) * 100) : 0
  const fmtKg = n => (n === 0 ? '—' : n % 1 === 0 ? `${n} kg` : `${n.toFixed(3)} kg`)

  return (
    <tr>
      <td colSpan={13} style={{ padding: '16px 20px', background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          {rstItems.filter(i => i !== 'Others').length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Weight size={11} /> RST Item Breakdown
              </div>
              <div style={{ border: '1px solid var(--border-light)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '5px 10px', background: 'var(--secondary-light)', fontSize: 10, fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase' }}>
                  <span>Item</span><span style={{ textAlign: 'right' }}>KG</span><span style={{ textAlign: 'right' }}>₹ Est.</span>
                </div>
                {rstItems.filter(i => i !== 'Others').map((item, idx) => {
                  const kg   = itemKgMap[item] || 0
                  const rate = pickuppartnerRateChart[item] ?? null
                  const estFromMap = Number(record.itemEstimatedMap?.[item] || 0)
                  const est  = estFromMap > 0 ? estFromMap : (rate !== null && kg > 0 ? Math.round(kg * rate) : null)
                  return (
                    <div key={item} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '6px 10px', fontSize: 12.5, borderTop: idx > 0 ? '1px solid var(--border-light)' : 'none', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                      <span style={{ fontWeight: 600 }}>{item}</span>
                      <span style={{ textAlign: 'right', color: kg > 0 ? 'var(--secondary)' : 'var(--text-muted)', fontWeight: kg > 0 ? 700 : 400 }}>{fmtKg(kg)}</span>
                      <span style={{ textAlign: 'right', color: est ? 'var(--primary)' : 'var(--text-muted)', fontWeight: est ? 700 : 400 }}>{est ? `₹${est}` : '—'}</span>
                    </div>
                  )
                })}
                {rstOthers.filter(o => o.name || o.amount).map((o, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '6px 10px', fontSize: 12.5, borderTop: '1px solid var(--border-light)', background: 'var(--primary-light)' }}>
                    <span style={{ fontWeight: 600 }}>{o.name || 'Others'}</span>
                    <span style={{ textAlign: 'right', color: 'var(--secondary)', fontWeight: 700 }}>{fmtKg(o.weight ? (o.unit === 'gm' ? o.weight / 1000 : Number(o.weight)) : 0)}</span>
                    <span style={{ textAlign: 'right', color: 'var(--primary)', fontWeight: 700 }}>{o.amount ? `₹${Number(o.amount).toLocaleString('en-IN')}` : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {sksItems.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--info)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>SKS Items</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sksItems.map((item, i) => (
                  <span key={i} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11.5, background: 'var(--info-bg)', color: 'var(--info)', fontWeight: 600 }}>{item}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Payment Detail</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
              {[
                { label: 'Total Value', value: fmtCurrency(total), color: 'var(--text-primary)' },
                { label: 'Received', value: fmtCurrency(paid), color: 'var(--secondary)' },
                { label: 'Pending', value: fmtCurrency(remaining), color: remaining > 0 ? 'var(--danger)' : 'var(--secondary)' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            {total > 0 && (
              <div>
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, collPct)}%`, background: collPct === 100 ? 'var(--secondary)' : collPct > 50 ? 'var(--warning)' : 'var(--danger)' }} />
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>{collPct}% collected</div>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Full Address</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {record.houseNo && <div><strong>House/Flat:</strong> {record.houseNo}</div>}
              {record.society && <div><strong>Society:</strong> {record.society}</div>}
              {(record.sector || record.city) && <div>{[record.sector, record.city].filter(Boolean).join(', ')}</div>}
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

export default function RaddiMaster() {
  const { RST_ITEMS, fetchFilteredRaddiRecords } = useApp()
  const defaultMonthRange = getPresetRange('month')

  // ── Local data state (self-fetching) ──────────────────────────────────────
  const [records,    setRecords]    = useState([])
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, pages: 0 })
  const [fetching,   setFetching]   = useState(false)
  const [fetchError, setFetchError] = useState('')

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search,       setSearch]      = useState('')
  const [filterPay,    setFPay]        = useState('')
  const [filterOrder,  setFOrder]      = useState('')
  const [filterpickuppartner, setFpickuppartner] = useState('')
  const [filterSector, setFSector]     = useState('')
  const [filterStatus, setFStatus]     = useState('')
  const [datePreset,   setPreset]      = useState('month')
  const [dateFrom,     setDateFrom]    = useState(defaultMonthRange.from)
  const [dateTo,       setDateTo]      = useState(defaultMonthRange.to)
  const [showFilters,  setFilters]     = useState(false)
  const [page,         setPage]        = useState(1)
  const [sortKey,      setSortKey]     = useState('pickupDate')
  const [sortDir,      setSortDir]     = useState('desc')
  const [expanded,     setExpanded]    = useState({})

  const debounceRef = useRef(null)
  const requestSeqRef = useRef(0)

  // Collect unique partner names and sectors from loaded records
  const pickuppartnerNames = useMemo(() => [...new Set(records.map(r => r.PickupPartnerName).filter(Boolean))].sort(), [records])
  const sectors  = useMemo(() => [...new Set(records.map(r => r.sector).filter(Boolean))].sort(), [records])

  const applyPreset = (p) => {
    setPreset(p)
    if (p !== 'custom') { const { from, to } = getPresetRange(p); setDateFrom(from); setDateTo(to) }
    setPage(1)
  }

  const toggleSort = (key) => {
    setSortDir(d => sortKey === key ? (d === 'asc' ? 'desc' : 'asc') : 'desc')
    setSortKey(key)
    setPage(1)
  }

  const toggleExpand = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  // ── Fetch params ──────────────────────────────────────────────────────────
  const fetchParams = useMemo(() => ({
    dateFrom:      dateFrom      || undefined,
    dateTo:        dateTo        || undefined,
    sector:        filterSector  || undefined,
    paymentStatus: filterPay     || undefined,
    q:             search        || undefined,
    page,
    pageSize:      PAGE_SIZE,
    limit:         500,
  }), [dateFrom, dateTo, filterSector, filterPay, search, page])

  // ── Auto-fetch on param changes ───────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestSeqRef.current
      setFetching(true)
      setFetchError('')
      try {
        const result = await fetchFilteredRaddiRecords(fetchParams)
        if (requestId !== requestSeqRef.current) return
        const rows = Array.isArray(result) ? result : (result?.records || [])
        const pag  = result?.pagination || { page: 1, pageSize: PAGE_SIZE, total: rows.length, pages: 1 }
        setRecords(rows)
        setPagination(pag)
      } catch (err) {
        if (requestId !== requestSeqRef.current) return
        setFetchError(err.message || 'Failed to load records')
        setRecords([])
      } finally {
        if (requestId === requestSeqRef.current) setFetching(false)
      }
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [fetchParams, fetchFilteredRaddiRecords])

  // ── Client-side sort + filter on loaded page ──────────────────────────────
  const displayed = useMemo(() => {
    let rows = [...records]
    // Client-side filters that aren't sent to backend (order status, partner, donor status)
    if (filterOrder)  rows = rows.filter(r => r.orderStatus    === filterOrder)
    if (filterpickuppartner) rows = rows.filter(r => r.PickupPartnerName === filterpickuppartner)
    if (filterStatus) rows = rows.filter(r => r.donorStatus    === filterStatus)

    rows.sort((a, b) => {
      let av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [records, filterOrder, filterpickuppartner, filterStatus, sortKey, sortDir])

  const totalPages = pagination.pages || Math.max(1, Math.ceil(pagination.total / PAGE_SIZE))

  const kpis = useMemo(() => ({
    orders:   pagination.total,
    kg:       displayed.reduce((s, r) => s + (r.totalKg     || 0), 0),
    revenue:  displayed.reduce((s, r) => s + (r.totalAmount || 0), 0),
    received: displayed.filter(r => r.paymentStatus === 'Received').reduce((s, r) => s + (r.totalAmount || 0), 0),
    pending:  displayed.filter(r => r.paymentStatus === 'Yet to Receive').reduce((s, r) => s + (r.totalAmount || 0), 0),
  }), [displayed, pagination.total])

  const hasFilters = filterPay || filterOrder || filterpickuppartner || filterSector || filterStatus

  const SortTh = ({ k, children, style: s }) => (
    <th onClick={() => toggleSort(k)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...s }}>
      {children}
      {sortKey === k
        ? <span style={{ marginLeft: 4, opacity: 0.6 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
        : <span style={{ marginLeft: 4, opacity: 0.2 }}>↕</span>}
    </th>
  )

  const handleExport = () => {
    const rows = displayed.map(r => {
      const base = {
        'Order ID':          r.orderId || '—',
        'Mobile':            r.mobile  || '—',
        'Name':              r.name    || '—',
        'House No':          r.houseNo || '—',
        'Society':           r.society || '—',
        'Sector':            r.sector  || '—',
        'City':              r.city    || '—',
        'Raddi Pickup Date': r.pickupDate || '—',
        'Order Date':        r.orderDate  || '—',
        'PickupPartner Name':   r.PickupPartnerName  || '—',
        'PickupPartner Phone':  r.PickupPartnerPhone || '—',
        'Donor Status':      r.donorStatus || '—',
      }
      const itemKgMap = r.itemKgMap || {};
      (RST_ITEMS || []).forEach(item => {
        const kg = itemKgMap[item] || 0
        base[`${item} (KG)`] = kg > 0 ? kg.toFixed(3) : ''
        const rate = (r.pickuppartnerRateChart || {})[item]
        const est  = rate && kg > 0 ? Math.round(kg * rate) : ''
        base[`${item} (₹ Est.)`] = est || ''
      })
      ;(r.rstOthers || []).forEach((o, i) => {
        const idx = i + 1
        base[`other item${idx} (name)`] = o.name || ''
        base[`other item${idx} (kg)`]  = o.weight ? (o.unit === 'gm' ? (Number(o.weight) / 1000).toFixed(3) : o.weight) : ''
        base[`other item${idx} (Rs)`]   = o.amount || ''
      })
      base['RST Items']        = (r.rstItems || []).join(', ')
      base['SKS Items']        = (r.sksItems || []).join(', ')
      base['Total KG']         = r.totalKg    || 0
      base['Total Value (₹)'] = r.totalAmount || 0
      base['Amount Paid (₹)'] = r.amountPaid  || 0
      base['Pending (₹)']     = Math.max(0, (r.totalAmount || 0) - (r.amountPaid || 0))
      base['Payment Status']   = r.paymentStatus || '—'
      base['Order Status']     = r.orderStatus   || '—'
      return base
    })
    exportToExcel(rows, 'RaddiMaster_Export')
  }

  return (
    <div className="page-body">
      {/* ── KPI Cards ── */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card blue">
          <div className="stat-icon"><Hash size={18} /></div>
          <div className="stat-value">{kpis.orders}</div>
          <div className="stat-label">Total Orders</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon"><Weight size={18} /></div>
          <div className="stat-value">{(kpis.kg).toFixed(1)}</div>
          <div className="stat-label">Total KG (page)</div>
        </div>
        <div className="stat-card orange">
          <div className="stat-icon"><IndianRupee size={18} /></div>
          <div className="stat-value">{fmtCurrency(kpis.revenue)}</div>
          <div className="stat-label">Total RST Value (page)</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon"><CheckCircle size={18} /></div>
          <div className="stat-value">{fmtCurrency(kpis.received)}</div>
          <div className="stat-label">Amount Received</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon"><Clock size={18} /></div>
          <div className="stat-value">{fmtCurrency(kpis.pending)}</div>
          <div className="stat-label">Pending Collection</div>
        </div>
      </div>

      {/* ── Date Filter ── */}
      <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Clock size={11} color="var(--primary)" /> Pickup Date Filter
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            ['', 'All Time'], ['today', 'Today'], ['last7', 'Last 7 Days'],
            ['month', 'This Month'], ['last_month', 'Last Month'], ['custom', 'Custom Range'],
          ].map(([v, label]) => (
            <button key={v} className={`btn btn-sm ${datePreset === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => applyPreset(v)}>
              {label}
            </button>
          ))}
          {datePreset === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} style={{ width: 145 }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} style={{ width: 145 }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Search + Filters ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-wrap" style={{ flex: '1 1 220px', minWidth: 0 }}>
          <Search className="icon" />
          <input
            placeholder="Search name, mobile, society, order ID…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <button
          className={`btn btn-sm ${showFilters ? 'btn-outline' : 'btn-ghost'}`}
          onClick={() => setFilters(f => !f)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          <SlidersHorizontal size={13} />
          {hasFilters
            ? <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {[filterPay, filterOrder, filterpickuppartner, filterSector, filterStatus].filter(Boolean).length}
              </span>
            : 'Filters'}
        </button>
      </div>

      {showFilters && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, background: 'var(--bg)', borderRadius: 10, padding: 12, border: '1px solid var(--border-light)', marginBottom: 12 }}>
          <select value={filterPay} onChange={e => { setFPay(e.target.value); setPage(1) }} style={{ fontSize: 12.5 }}>
            <option value="">All Payment Status</option>
            <option value="Received">Received</option>
            <option value="Yet to Receive">Yet to Receive</option>
            <option value="Write-off">Write-off</option>
          </select>
          <select value={filterOrder} onChange={e => { setFOrder(e.target.value); setPage(1) }} style={{ fontSize: 12.5 }}>
            <option value="">All Order Status</option>
            <option value="Completed">Completed</option>
            <option value="Pending">Pending</option>
            <option value="Postponed">Postponed</option>
          </select>
          <select value={filterpickuppartner} onChange={e => { setFpickuppartner(e.target.value); setPage(1) }} style={{ fontSize: 12.5 }}>
            <option value="">All Partners</option>
            {pickuppartnerNames.map(k => <option key={k}>{k}</option>)}
          </select>
          <select value={filterSector} onChange={e => { setFSector(e.target.value); setPage(1) }} style={{ fontSize: 12.5 }}>
            <option value="">All Sectors</option>
            {sectors.map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={filterStatus} onChange={e => { setFStatus(e.target.value); setPage(1) }} style={{ fontSize: 12.5 }}>
            <option value="">All Donor Statuses</option>
            <option value="Active">Active</option>
            <option value="Pickup Due">Pickup Due</option>
            <option value="At Risk">At Risk</option>
            <option value="Churned">Churned</option>
          </select>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11.5 }}
              onClick={() => { setFPay(''); setFOrder(''); setFpickuppartner(''); setFSector(''); setFStatus(''); setPage(1) }}>
              <X size={11} /> Clear All
            </button>
          )}
        </div>
      )}

      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
        <span><strong style={{ color: 'var(--text-primary)' }}>{pagination.total}</strong> total records</span>
        {fetching && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="spin" style={{ display: 'inline-block', width: 12, height: 12, border: '1.5px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
            Loading…
          </span>
        )}
        {fetchError && <span style={{ color: 'var(--danger)' }}>⚠ {fetchError}</span>}
        {totalPages > 1 && <span style={{ marginLeft: 'auto' }}>Page {page}/{totalPages}</span>}
        <button className="btn btn-ghost btn-sm" onClick={handleExport} style={{ marginLeft: totalPages > 1 ? 0 : 'auto' }}>
          <Download size={12} /> Export Page
        </button>
      </div>

      {/* ── Table ── */}
      {displayed.length === 0 && !fetching ? (
        <div className="empty-state" style={{ padding: 60 }}>
          <div className="empty-icon"><Package size={24} /></div>
          <h3>No records found</h3>
          <p>Try adjusting your filters or date range.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28, padding: '10px 6px' }}></th>
                  <SortTh k="orderId">Order ID</SortTh>
                  <SortTh k="mobile">Mobile</SortTh>
                  <SortTh k="name">Donor Name</SortTh>
                  <th>House No</th>
                  <th>Society</th>
                  <SortTh k="sector">Sector</SortTh>
                  <SortTh k="city">City</SortTh>
                  <SortTh k="pickupDate">Pickup Date</SortTh>
                  <th>Partner</th>
                  <SortTh k="donorStatus">Donor Status</SortTh>
                  <th>RST Items</th>
                  <th>SKS Items</th>
                  <SortTh k="totalKg">KG</SortTh>
                  <SortTh k="totalAmount">Total ₹</SortTh>
                  <SortTh k="amountPaid">Paid ₹</SortTh>
                  <SortTh k="paymentStatus">Payment</SortTh>
                  <SortTh k="orderStatus">Order</SortTh>
                </tr>
              </thead>
              <tbody>
                {displayed.map(r => {
                  const key    = r.orderId || r.pickupId
                  const isOpen = !!expanded[key]
                  const payDue = Math.max(0, (r.totalAmount || 0) - (r.amountPaid || 0))
                  const hasItem = Object.keys(r.itemKgMap || {}).length > 0 || (r.rstOthers || []).length > 0 || (r.sksItems || []).length > 0

                  return [
                    <tr key={key} onClick={() => toggleExpand(key)} style={{ cursor: 'pointer' }}>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '11px 6px' }}>
                        {hasItem ? (isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : null}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', padding: '2px 7px', borderRadius: 5 }}>
                          {r.orderId || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5, fontFamily: 'monospace' }}>{r.mobile || '—'}</td>
                      <td><div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div></td>
                      <td style={{ fontSize: 12.5 }}>{r.houseNo || '—'}</td>
                      <td style={{ fontSize: 12.5, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.society || '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sector || '—'}</td>
                      <td style={{ fontSize: 12.5 }}>{r.city || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 600 }}>{fmtDate(r.pickupDate)}</td>
                      <td style={{ fontSize: 12.5 }}>{r.PickupPartnerName || '—'}</td>
                      <td><Badge label={r.donorStatus || 'Active'} cfg={DONOR_STATUS_BADGE[r.donorStatus] || DONOR_STATUS_BADGE['Active']} /></td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxWidth: 160 }}>
                          {(r.rstItems || []).length > 0
                            ? (r.rstItems || []).slice(0, 3).map(item => (
                                <span key={item} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: 'var(--secondary-light)', color: 'var(--secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{item}</span>
                              ))
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                          {(r.rstItems || []).length > 3 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{(r.rstItems || []).length - 3}</span>}
                        </div>
                      </td>
                      <td>
                        {(r.sksItems || []).length > 0
                          ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--info-bg)', color: 'var(--info)', fontWeight: 700 }}>{r.sksItems.length} items</span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.totalKg > 0 ? `${r.totalKg} kg` : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{r.totalAmount > 0 ? fmtCurrency(r.totalAmount) : '—'}</div>
                        {payDue > 0 && <div style={{ fontSize: 10.5, color: 'var(--danger)', fontWeight: 600 }}>Due: {fmtCurrency(payDue)}</div>}
                      </td>
                      <td style={{ color: 'var(--secondary)', fontWeight: 600 }}>
                        {(r.amountPaid || 0) > 0 ? fmtCurrency(r.amountPaid) : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span>}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <Badge label={r.paymentStatus || 'Yet to Receive'} cfg={PAYMENT_BADGE[r.paymentStatus] || PAYMENT_BADGE['Yet to Receive']} />
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <Badge label={r.orderStatus || 'Completed'} cfg={ORDER_BADGE[r.orderStatus] || ORDER_BADGE['Completed']} />
                      </td>
                    </tr>,
                    isOpen && <RowDetail key={`${key}-detail`} record={r} />,
                  ]
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mobile-cards">
            {displayed.map(r => {
              const payDue = Math.max(0, (r.totalAmount || 0) - (r.amountPaid || 0))
              return (
                <div key={r.orderId || r.pickupId} className="card" style={{ marginBottom: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', padding: '2px 7px', borderRadius: 5 }}>
                        {r.orderId || r.pickupId}
                      </span>
                      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.mobile}</div>
                    </div>
                    <Badge label={r.paymentStatus || 'Yet to Receive'} cfg={PAYMENT_BADGE[r.paymentStatus] || PAYMENT_BADGE['Yet to Receive']} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {[r.houseNo, r.society, r.sector, r.city].filter(Boolean).join(', ')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Pickup: {fmtDate(r.pickupDate)} · Partner: {r.PickupPartnerName || '—'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Badge label={r.donorStatus || 'Active'} cfg={DONOR_STATUS_BADGE[r.donorStatus] || DONOR_STATUS_BADGE['Active']} />
                    {r.totalKg > 0 && <span style={{ fontSize: 12, fontWeight: 600 }}>{r.totalKg} kg</span>}
                    {r.totalAmount > 0 && <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>{fmtCurrency(r.totalAmount)}</span>}
                    {payDue > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 12 }}>Due: {fmtCurrency(payDue)}</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || fetching}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>({pagination.total} total)</span>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || fetching}>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
