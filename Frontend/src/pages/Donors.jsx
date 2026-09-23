// Frontend/src/pages/Donors.jsx
import { useState, useMemo } from 'react'
import {
  Search, Plus, Edit2, Trash2, X, Phone, MapPin,
  AlertTriangle, Clock, CheckCircle,
  AlertCircle, UserX, Loader, Download,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtDate, fmtCurrency, donorStatusColor } from '../utils/helpers'
import { differenceInDays, parseISO } from 'date-fns'
import SocietyInput from '../components/SocietyInput'
import SectorSearchSelect from '../components/SectorSearchSelect'
import { useEffect } from 'react'
import useDonorMobileCheck from '../hooks/useDonorMobileCheck'
import DonorDuplicateAlert from '../components/DonorDuplicateAlert'

// ── Segments ──────────────────────────────────────────────────────────────────
const SEGMENTS = [
  { id: 'all',        label: 'All',        color: 'var(--text-secondary)', bg: 'var(--border-light)', borderColor: 'var(--border)', icon: null },
  { id: 'Active',     label: 'Active',     color: 'var(--secondary)',      bg: 'var(--secondary-light)', borderColor: 'var(--secondary)', icon: CheckCircle, description: '1–30 days since last pickup', days: [1, 30] },
  { id: 'Pickup Due', label: 'Pickup Due', color: 'var(--info)',           bg: 'var(--info-bg)',         borderColor: 'var(--info)',      icon: Clock,        description: '31–45 days since last pickup' },
  { id: 'At Risk',    label: 'At Risk',    color: 'var(--warning)',        bg: 'var(--warning-bg)',      borderColor: 'var(--warning)',   icon: AlertCircle,  description: '46–60 days since last pickup' },
  { id: 'Churned',    label: 'Churned',    color: 'var(--danger)',         bg: 'var(--danger-bg)',       borderColor: 'var(--danger)',    icon: UserX,        description: '>61 days since last pickup' },
]

function getSegment(donor) { return donor.status || 'Active' }
function daysSince(dateStr) {
  if (!dateStr) return null
  return differenceInDays(new Date(), parseISO(dateStr))
}
function safeAmount(value) { const n = Number(value); return Number.isFinite(n) ? n : 0 }

function donorRSTAmount(donor, fallbackFromPickups = 0) {
  const fromDoc = [donor?.totalRST, donor?.totalRst, donor?.totalRaddi, donor?.rstTotal]
    .map(v => Number(v)).find(v => Number.isFinite(v))
  if (Number.isFinite(fromDoc) && fromDoc > 0) return fromDoc
  return safeAmount(fallbackFromPickups)
}

function CategoryBadge({ donorType }) {
  if (donorType === 'both') return (
    <span title="RST/SKS Donor + Supporter" style={{ fontSize: 15, cursor: 'help', flexShrink: 0, letterSpacing: 1 }}>👍❤️</span>
  )
  return <span title="RST/SKS Donor" style={{ fontSize: 14, cursor: 'help', flexShrink: 0 }}>👍</span>
}

function SegmentChip({ segId }) {
  const seg = SEGMENTS.find(s => s.id === segId)
  if (!seg || segId === 'all') return null
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700, background:seg.bg, color:seg.color, border:`1px solid ${seg.borderColor}22` }}>
      {seg.label}
    </span>
  )
}

const EMPTY_FORM = {
  name: '', mobile: '', house: '', society: '',
  city: 'Gurgaon', sector: '',
  donorType: 'donor',
  lostReason: '', notes: '',
}

export default function Donors({ triggerAddDonor, onAddDonorDone, onNav }) {
  const { donors, pickups, addDonor, updateDonor, deleteDonor, CITIES, CITY_SECTORS, locations, upsertLocation, user } = useApp()

  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)

  const [search, setSearch]               = useState('')
  const [filterCity, setFilterCity]       = useState('Gurgaon')
  const [filterSector, setFilterSector]   = useState('')
  const [filterSociety, setFilterSociety] = useState('')
  const [activeSeg, setActiveSeg]         = useState('all')

  const sectorOptions = CITY_SECTORS[filterCity] || []
  const formSectors   = CITY_SECTORS[form.city] || []

  // ── Dedup check — only active when adding (not editing) ───────────────────
  const mobileCheck = useDonorMobileCheck(modal && !editing ? form.mobile : '')

  // Track confirmed existing match persistently (survives alert dismiss)
  const [confirmedExisting, setConfirmedExisting] = useState(null)
  useEffect(() => {
    if (mobileCheck.status === 'found' && mobileCheck.existing) {
      setConfirmedExisting(mobileCheck.existing)
    }
  }, [mobileCheck.status, mobileCheck.existing])

  const allSocieties = useMemo(() => [...new Set([
    ...(locations.societies || []).map(s => s.name),
    ...donors.map(d => d.society).filter(Boolean),
  ])].sort(), [donors, locations.societies])

  const actualDonors = useMemo(() =>
    donors.filter(d => d.donorType !== 'supporter'), [donors])

  const segCounts = useMemo(() => {
    const counts = { all: actualDonors.length }
    actualDonors.forEach(d => { const seg = getSegment(d); counts[seg] = (counts[seg] || 0) + 1 })
    return counts
  }, [actualDonors])

  const pickupRSTByDonor = useMemo(() => {
    const totals = {}
    pickups.forEach(p => {
      if (p.status !== 'Completed') return
      const donorId = p.donorId; if (!donorId) return
      totals[donorId] = (totals[donorId] || 0) + safeAmount(p.totalValue)
    })
    return totals
  }, [pickups])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return donors.filter(d => {
      if (d.donorType === 'supporter') return false
      const seg = getSegment(d)
      const matchSeg    = activeSeg === 'all' ? true : seg === activeSeg
      const matchQ      = !q || d.name.toLowerCase().includes(q) || d.mobile.includes(q) || d.society?.toLowerCase().includes(q) || d.id?.toLowerCase().includes(q)
      const matchCity   = !filterCity   || d.city === filterCity
      const matchSector = !filterSector || d.sector === filterSector
      const matchSoc    = !filterSociety || d.society === filterSociety
      return matchSeg && matchQ && matchCity && matchSector && matchSoc
    })
  }, [donors, activeSeg, search, filterCity, filterSector, filterSociety])

  const hasFilters = filterCity !== 'Gurgaon' || filterSector || filterSociety

  const openModal = (donor = null) => {
    setEditing(donor)
    setForm(donor
      ? { ...EMPTY_FORM, ...donor, donorType: donor.donorType || 'donor' }
      : EMPTY_FORM
    )
    setConfirmedExisting(null)
    setModal(true)
  }
  const closeModal = () => { setModal(false); setEditing(null); setConfirmedExisting(null); mobileCheck.reset() }

  const setField = (key, val) => {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'city')   { next.sector = ''; next.society = '' }
      if (key === 'sector') { next.society = '' }
      return next
    })
    if (key === 'mobile') setConfirmedExisting(null)
  }

  const handleUseExisting = () => { mobileCheck.reset() }

  const save = async () => {
    if (!form.name.trim() || !form.mobile.trim()) return
    setSaving(true)
    try {
      const data = { ...form }
      if (!editing) data.donorType = 'donor'

      if (editing) {
        await updateDonor(editing.id, data)
      } else if (confirmedExisting) {
        const mergedDonorType =
          confirmedExisting.donorType === 'supporter' ? 'both'
          : confirmedExisting.donorType === 'both'     ? 'both'
          : 'donor'
        await updateDonor(confirmedExisting.id, {
          ...confirmedExisting,
          ...data,
          donorType: mergedDonorType,
        })
      } else {
        await addDonor(data)
      }
      closeModal()
    } finally { setSaving(false) }
  }

  const remove = (id) => {
    if (!confirm('Delete this donor?')) return
    deleteDonor(id)
  }

  // TODO: replace `true` with your actual role check, e.g. user?.role === 'admin'
  const canExport = true

  const exportToExcel = () => {
    // '05-May-2026' format — plain text so Excel never shows #######
    const fmtExcelDate = dateStr => {
      if (!dateStr) return ''
      const dt = new Date(dateStr)
      if (isNaN(dt)) return ''
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      return String(dt.getDate()).padStart(2,'0') + '-' + months[dt.getMonth()] + '-' + dt.getFullYear()
    }

    const headers = ['ID', 'Name', 'Mobile', 'Type', 'House/Flat', 'Society', 'Sector', 'City', 'Status', 'RST Donated', 'Last Pickup', 'Notes']
    const rows = filtered.map(d => {
      const rst = donorRSTAmount(d, pickupRSTByDonor[d.id])
      return [
        d.id ?? '',
        d.name ?? '',
        d.mobile ?? '',
        d.donorType ?? '',
        d.house ?? '',
        d.society ?? '',
        d.sector ?? '',
        d.city ?? '',
        getSegment(d),
        rst,
        fmtExcelDate(d.lastPickup),
        d.notes ?? '',
      ]
    })

    const escape = v => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }

    const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n')
    const bom = '\uFEFF' // UTF-8 BOM so Excel renders non-ASCII correctly
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `donors_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeSegCfg = activeSeg !== 'all' ? SEGMENTS.find(s => s.id === activeSeg) : null

  return (
    <div className="page-body">

      {/* ── Segment KPI strip ── */}
      <div style={{ marginBottom:16, padding:'10px 14px', background:'var(--surface)', borderRadius:10, border:'1px solid var(--border-light)', boxShadow:'var(--shadow)' }}>
        <div style={{ display:'flex', gap:0, borderRadius:8, overflow:'hidden', border:'1px solid var(--border-light)' }}>
          {/* All cell */}
          <button onClick={() => setActiveSeg('all')} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 8px', border:'none', cursor:'pointer', background: activeSeg==='all' ? 'var(--primary-light)' : 'var(--surface)', transition:'all 0.15s', outline: activeSeg==='all' ? '2px solid var(--primary)' : 'none', outlineOffset:-2 }}>
            <Search size={14} color={activeSeg==='all'?'var(--primary)':'var(--text-muted)'} style={{ marginBottom:4 }} />
            <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:800, color:activeSeg==='all'?'var(--primary)':'var(--text-primary)', lineHeight:1 }}>{segCounts.all}</div>
            <div style={{ fontSize:10.5, fontWeight:700, color:activeSeg==='all'?'var(--primary)':'var(--text-muted)', marginTop:2 }}>All</div>
          </button>
          {SEGMENTS.filter(s => s.id !== 'all').map(seg => {
            const Icon = seg.icon; const count = segCounts[seg.id] || 0; const isActive = activeSeg === seg.id
            return (
              <button key={seg.id} onClick={() => setActiveSeg(isActive ? 'all' : seg.id)}
                style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 8px', border:'none', cursor:'pointer', background: isActive ? seg.bg : 'var(--surface)', borderLeft:'1px solid var(--border-light)', transition:'all 0.15s', outline: isActive ? `2px solid ${seg.color}` : 'none', outlineOffset:-2 }}>
                {Icon && <Icon size={14} color={isActive?seg.color:'var(--text-muted)'} style={{ marginBottom:4 }} />}
                <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:800, color:isActive?seg.color:'var(--text-primary)', lineHeight:1 }}>{count}</div>
                <div style={{ fontSize:10.5, fontWeight:700, color:isActive?seg.color:'var(--text-muted)', marginTop:2, textAlign:'center', lineHeight:1.3 }}>{seg.label}</div>
                {seg.description && <div style={{ fontSize:9.5, color:'var(--text-muted)', marginTop:1, textAlign:'center' }}>{seg.description}</div>}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Supporters link banner ── */}
      {onNav && (
        <div style={{ marginBottom: 14, padding: '10px 16px', background: 'linear-gradient(135deg,#FDE7DA,var(--secondary-light))', borderRadius: 10, border: '1px solid rgba(232,82,26,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>❤️</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
            <strong>Supporters</strong> (goods, money, clothes) — managed separately
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => onNav('supporters')}>View Supporters →</button>
        </div>
      )}

      {/* ── Icon legend ── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', padding:'8px 14px', background:'var(--bg)', borderRadius:8, border:'1px solid var(--border-light)', marginBottom:14, fontSize:12, color:'var(--text-muted)' }}>
        <span style={{ fontWeight:600, color:'var(--text-secondary)', marginRight:4 }}>Donor type:</span>
        <span>👍 RST/SKS Donor</span>
        <span style={{ color:'var(--border)' }}>·</span>
        <span>👍❤️ Donor + Supporter</span>
      </div>

      {/* ── Search + filters + actions — single row ── */}
      <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap', marginBottom:12 }}>

        {/* Search */}
        <div style={{ position:'relative', flex:'2 1 180px', minWidth:0 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }} />
          <input
            placeholder="Search name, mobile, society, ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft:28, fontSize:12.5, width:'100%', height:34 }}
          />
        </div>

        {/* City */}
        <select
          value={filterCity}
          onChange={e => { setFilterCity(e.target.value); setFilterSector('') }}
          style={{ flex:'1 1 110px', fontSize:12, height:34, minWidth:0 }}
        >
          {CITIES.map(c => <option key={c}>{c}</option>)}
        </select>

        {/* Sector */}
        <select
          value={filterSector}
          onChange={e => setFilterSector(e.target.value)}
          style={{ flex:'1 1 110px', fontSize:12, height:34, minWidth:0 }}
        >
          <option value="">All Sectors</option>
          {sectorOptions.map(s => <option key={s}>{s}</option>)}
        </select>

        {/* Society */}
        <select
          value={filterSociety}
          onChange={e => setFilterSociety(e.target.value)}
          style={{ flex:'1 1 120px', fontSize:12, height:34, minWidth:0 }}
        >
          <option value="">All Societies</option>
          {allSocieties.map(s => <option key={s}>{s}</option>)}
        </select>

        {/* Clear filters */}
        {hasFilters && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setFilterCity('Gurgaon'); setFilterSector(''); setFilterSociety('') }}
            style={{ flexShrink:0, fontSize:11, height:34, display:'flex', alignItems:'center', gap:3, padding:'0 8px' }}
            title="Reset filters"
          >
            <X size={11} /> Clear
          </button>
        )}

        {/* Add */}
        <button
          className="btn btn-primary btn-sm"
          onClick={() => openModal()}
          style={{ flexShrink:0, height:34, fontSize:12, display:'flex', alignItems:'center', gap:4, padding:'0 12px' }}
        >
          <Plus size={13} /> Add
        </button>

        {/* Export (admin / manager only) */}
        {canExport && (
          <button
            className="btn btn-outline btn-sm"
            onClick={exportToExcel}
            style={{ flexShrink:0, height:34, fontSize:12, display:'flex', alignItems:'center', gap:4, padding:'0 10px' }}
            title="Export to Excel"
          >
            <Download size={13} /> Export
          </button>
        )}
      </div>

      {/* ── Active segment filter pill ── */}
      {activeSegCfg && (
        <div style={{ marginBottom:14, display:'flex', alignItems:'center', gap:10, padding:'9px 14px', borderRadius:10, background:activeSegCfg.bg, border:`1px solid ${activeSegCfg.color}33` }}>
          {activeSegCfg.icon && <activeSegCfg.icon size={14} color={activeSegCfg.color} />}
          <span style={{ fontSize:13, fontWeight:700, color:activeSegCfg.color }}>{activeSegCfg.label}</span>
          {activeSegCfg.description && <span style={{ fontSize:12.5, color:activeSegCfg.color, opacity:0.8 }}>— {activeSegCfg.description}</span>}
          <span style={{ fontSize:12.5, color:activeSegCfg.color, opacity:0.8 }}>· {segCounts[activeSeg]||0} donor{(segCounts[activeSeg]||0)!==1?'s':''}</span>
          <button onClick={() => setActiveSeg('all')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:activeSegCfg.color, display:'flex', padding:2 }}><X size={14} /></button>
        </div>
      )}

      <div style={{ fontSize:12, color:'var(--text-muted)', margin:'0 0 12px' }}>
        Showing <strong>{filtered.length}</strong> of <strong>{actualDonors.length}</strong> donors
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Search size={24} /></div>
          <h3>No donors found</h3>
          <p>Try adjusting your search or filters.</p>
        </div>
      ) : (
        <>
          {/* ── Desktop table ── */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Mobile</th>
                  <th>Status</th>
                  <th>RST Donated</th>
                  <th>Last Pickup</th>
                  <th>Location</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const seg     = getSegment(d)
                  const segDef  = SEGMENTS.find(s => s.id === seg)
                  const days    = daysSince(d.lastPickup)
                  const overdue = d.nextPickup && new Date(d.nextPickup) < new Date() && d.status === 'Active'
                  const rst     = donorRSTAmount(d, pickupRSTByDonor[d.id])
                  return (
                    <tr key={d.id} style={{ borderLeft:`3px solid ${segDef?.borderColor || 'var(--border-light)'}` }}>
                      {/* ID */}
                      <td>
                        <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:800, color:'white', background:'var(--primary)', padding:'2px 8px', borderRadius:5 }}>
                          {d.id}
                        </span>
                      </td>

                      {/* Name */}
                      <td>
                        <div style={{ fontWeight:700, fontSize:13 }}>{d.name}</div>
                        {d.status === 'Lost' && d.lostReason && (
                          <div style={{ fontSize:11, color:'var(--danger)', display:'flex', alignItems:'center', gap:3, marginTop:2 }}>
                            <AlertTriangle size={9} /> Lost: {d.lostReason}
                          </div>
                        )}
                      </td>

                      {/* Type */}
                      <td><CategoryBadge donorType={d.donorType} /></td>

                      {/* Mobile */}
                      <td style={{ fontFamily:'monospace', fontSize:12.5 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <Phone size={10} color="var(--text-muted)" />{d.mobile || '—'}
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <SegmentChip segId={seg} />
                          {days !== null ? (
                            <span style={{ fontSize:11, color: days<=30?'var(--secondary)':days<=45?'var(--info)':days<=60?'var(--warning)':'var(--danger)', fontWeight:600, display:'flex', alignItems:'center', gap:3 }}>
                              <Clock size={9} />{days}d ago
                            </span>
                          ) : (
                            <span style={{ fontSize:11, color:'var(--text-muted)' }}>No pickup yet</span>
                          )}
                        </div>
                      </td>

                      {/* RST Donated */}
                      <td>
                        <span style={{ fontWeight:700, fontSize:12.5, color:'var(--secondary)' }}>
                          {fmtCurrency(rst)}
                        </span>
                      </td>

                      {/* Last Pickup */}
                      <td style={{ whiteSpace:'nowrap' }}>
                        {d.lastPickup
                          ? <div style={{ fontSize:12.5, fontWeight:600 }}>{fmtDate(d.lastPickup)}</div>
                          : <span style={{ color:'var(--text-muted)', fontSize:12 }}>—</span>}
                      </td>

                      {/* Location */}

                      <td>
                        <div style={{ fontSize:12.5 }}>
                          {d.house && <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:1 }}>{d.house}</div>}
                          {d.society && <div style={{ fontWeight:500 }}>{d.society}</div>}
                          <div style={{ color:'var(--text-muted)', fontSize:11.5 }}>
                            {[d.sector, d.city].filter(Boolean).join(', ')}
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td onClick={e => e.stopPropagation()}>
                        <div className="td-actions">
                          <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => openModal(d)}><Edit2 size={13} /></button>
                          <button className="btn btn-danger btn-icon btn-sm" title="Delete" onClick={() => remove(d.id)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Mobile cards ── */}
          <div className="mobile-cards">
            {filtered.map(d => {
              const seg    = getSegment(d)
              const segDef = SEGMENTS.find(s => s.id === seg)
              const days   = daysSince(d.lastPickup)
              const overdue = d.nextPickup && new Date(d.nextPickup) < new Date() && d.status === 'Active'
              const rst    = donorRSTAmount(d, pickupRSTByDonor[d.id])
              return (
                <div key={d.id} className="card" style={{ marginBottom:10, padding:14, borderLeft:`3px solid ${segDef?.borderColor || 'var(--border-light)'}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
                        <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:800, color:'white', background:'var(--primary)', padding:'1px 7px', borderRadius:4 }}>{d.id}</span>
                        <CategoryBadge donorType={d.donorType} />
                        <div style={{ fontWeight:700, fontSize:14 }}>{d.name}</div>
                      </div>
                      {d.mobile && (
                        <div style={{ fontSize:12, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:4 }}>
                          <Phone size={10} /> {d.mobile}
                        </div>
                      )}
                    </div>
                    <SegmentChip segId={seg} />
                  </div>

                  {/* Stats row */}
                  <div style={{ display:'flex', gap:12, marginBottom:6, flexWrap:'wrap' }}>
                    <div style={{ fontSize:12 }}>
                      <span style={{ color:'var(--text-muted)' }}>RST: </span>
                      <span style={{ fontWeight:700, color:'var(--secondary)' }}>{fmtCurrency(rst)}</span>
                    </div>
                    <div style={{ fontSize:12 }}>
                      <span style={{ color:'var(--text-muted)' }}>Last: </span>
                      <span style={{ fontWeight:600 }}>{d.lastPickup ? fmtDate(d.lastPickup) : '—'}</span>
                    </div>
                    {days !== null && (
                      <span style={{ fontSize:11, color: days<=30?'var(--secondary)':days<=45?'var(--info)':days<=60?'var(--warning)':'var(--danger)', fontWeight:600, display:'flex', alignItems:'center', gap:3 }}>
                        <Clock size={9} />{days}d ago
                      </span>
                    )}
                  </div>

                  {(d.society || d.sector || d.city || d.house) && (
                    <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:6, display:'flex', alignItems:'center', gap:4 }}>
                      <MapPin size={10} /> {[d.house, d.society, d.sector, d.city].filter(Boolean).join(', ')}
                    </div>
                  )}

                  {d.status === 'Lost' && d.lostReason && (
                    <div style={{ fontSize:11.5, color:'var(--danger)', background:'var(--danger-bg)', padding:'3px 8px', borderRadius:5, marginBottom:6, display:'flex', alignItems:'center', gap:4 }}>
                      <AlertTriangle size={9} /> Lost: {d.lostReason}
                    </div>
                  )}

                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                    <div style={{ fontSize:12, color: overdue?'var(--danger)':'var(--text-muted)', fontWeight: overdue?600:400 }}>
                      {d.status === 'Lost' ? '' : overdue ? `⚠ Next: ${fmtDate(d.nextPickup)}` : `Next: ${fmtDate(d.nextPickup) || '—'}`}
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openModal(d)}><Edit2 size={12} /></button>
                      <button className="btn btn-danger btn-icon btn-sm" onClick={() => remove(d.id)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Add / Edit Modal ── */}
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal" style={{ maxWidth:600, width:'95vw' }}>
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Edit Donor' : 'Add New Donor'}</div>
              {editing && (
                <span style={{ fontSize:12, fontFamily:'monospace', fontWeight:800, color:'white', background:'var(--primary)', padding:'2px 10px', borderRadius:5 }}>
                  {editing.id}
                </span>
              )}
              <button className="btn btn-ghost btn-icon btn-sm" onClick={closeModal}><X size={16} /></button>
            </div>

            <div className="modal-body" style={{ maxHeight:'72vh', overflowY:'auto' }}>

              {/* ── Duplicate alert (add mode only) ── */}
              {!editing && mobileCheck.status === 'found' && mobileCheck.existing && (
                <DonorDuplicateAlert
                  donor={mobileCheck.existing}
                  context="adding-donor"
                  onUseExisting={handleUseExisting}
                  onDismiss={mobileCheck.reset}
                />
              )}

              {/* ── Merge confirmation ── */}
              {!editing && confirmedExisting && mobileCheck.status !== 'found' && (
                <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: confirmedExisting.donorType === 'supporter' ? 'var(--secondary-light)' : 'var(--warning-bg)', border: `1px solid ${confirmedExisting.donorType === 'supporter' ? 'rgba(27,94,53,0.2)' : 'rgba(245,158,11,0.3)'}`, fontSize: 12.5, color: confirmedExisting.donorType === 'supporter' ? 'var(--secondary)' : '#92400E', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>
                    {confirmedExisting.donorType === 'supporter' ? '👍❤️' : confirmedExisting.donorType === 'both' ? '👍❤️' : '👍'}
                  </span>
                  Saving will merge <strong>{confirmedExisting.name}</strong> ({confirmedExisting.id}) into a combined{' '}
                  {confirmedExisting.donorType === 'supporter' ? 'Donor + Supporter' : 'Donor'} profile.
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name <span className="required">*</span></label>
                  <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Donor full name" autoFocus />
                </div>

                <div className="form-group">
                  <label>Mobile Number <span className="required">*</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      value={form.mobile}
                      onChange={e => setField('mobile', e.target.value.replace(/\D/g, '').slice(0,10))}
                      placeholder="10-digit mobile"
                      maxLength={10}
                      inputMode="numeric"
                      style={{ paddingRight: 36 }}
                    />
                    {!editing && mobileCheck.status === 'checking' && (
                      <Loader size={14} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', animation:'spin 0.8s linear infinite' }} />
                    )}
                    {!editing && mobileCheck.status === 'clear' && (
                      <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'var(--secondary)' }}>✓</span>
                    )}
                    {!editing && mobileCheck.status === 'found' && (
                      <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'var(--warning)' }}>⚠</span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>House / Flat No.</label>
                  <input value={form.house} onChange={e => setField('house', e.target.value)} placeholder="e.g. A-101" />
                </div>
                <div className="form-group">
                  <label>City <span className="required">*</span></label>
                  <input list="donor-cities" value={form.city} onChange={e => setField('city', e.target.value)} placeholder="Type or choose city" />
                  <datalist id="donor-cities">{CITIES.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="form-group">
                  <label>Sector / Area</label>
                  <SectorSearchSelect
                    options={formSectors}
                    value={form.sector}
                    onChange={val => setField('sector', val)}
                    disabled={!form.city}
                    placeholder={form.city ? 'Search or select sector' : 'Select city first'}
                    onAddOption={async sectorName => { await upsertLocation({ city: form.city, sector: sectorName }); return sectorName }}
                    addLabel="Add sector"
                  />
                </div>
                <div className="form-group full">
                  <label>Society / Colony</label>
                  <SocietyInput city={form.city} sector={form.sector} value={form.society} onChange={val => setField('society', val)} id="donors-modal" />
                </div>
                <div className="form-group full">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Any additional notes…" style={{ minHeight:72 }} />
                </div>
              </div>

              {editing && editing.donorType === 'both' && (
                <div style={{ marginTop: 14, padding: '10px 14px', background: 'linear-gradient(135deg,#FDE7DA,var(--secondary-light))', borderRadius: 8, fontSize: 12.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>👍❤️</span>
                  This person is also a Supporter. To change their supporter details, visit the <strong>Supporters page</strong>.
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={
                  saving ||
                  !form.name.trim() ||
                  !form.mobile.trim() ||
                  (!editing && mobileCheck.status === 'checking')
                }
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : confirmedExisting ? '👍❤️ Merge & Add Donor' : 'Add Donor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
