// Frontend/src/pages/Pickuppartners.jsx
 
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Phone, Plus, Edit2, Trash2, X, Mail,
  IndianRupee, AlertCircle, CheckCircle,
  ChevronDown, ChevronUp, Package,
  MapPin, Search, Users, Building2, Layers,
  UserCheck, UserX, RefreshCw, Upload, Image, FileText, Eye,
  ShieldCheck,
} from 'lucide-react'
import { useApp }  from '../context/AppContext'
import { useRole } from '../context/RoleContext'
import { fmtCurrency } from '../utils/helpers'

// Rate chart items and defaults are derived dynamically from backend master data
function buildRateChartDefaults(rstItemsFull = []) {
  const items = rstItemsFull.filter(i => i.active !== false && i.name !== 'Others')
  if (items.length === 0) return { items: [], defaults: {} }
  return {
    items: items.map(i => i.name),
    defaults: Object.fromEntries(items.map(i => [i.name, i.rate || 0]))
  }
}

const isPartnerActive = (k) => k?.isActive !== false && k?.active !== false
const MAX_PARTNER_FILE_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB || 8)
const MAX_PARTNER_FILE_BYTES = MAX_PARTNER_FILE_MB * 1024 * 1024
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DOCUMENT_TYPES = new Set([...PHOTO_TYPES, 'application/pdf'])

function isFileValue(value) {
  return typeof File !== 'undefined' && value instanceof File
}

function validatePartnerFile(file, key) {
  const allowed = key === 'photo' ? PHOTO_TYPES : DOCUMENT_TYPES
  const label = key === 'photo' ? 'Photo' : 'Aadhaar document'

  if (!allowed.has(file.type)) {
    return key === 'photo'
      ? `${label} must be a JPEG, PNG, or WebP image.`
      : `${label} must be a JPEG, PNG, WebP, or PDF file.`
  }

  if (file.size > MAX_PARTNER_FILE_BYTES) {
    return `${label} must be ${MAX_PARTNER_FILE_MB} MB or smaller.`
  }

  return ''
}

function ToastStack({ toasts, onRemove }) {
  return (
    <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => {
        const success = t.type === 'success'
        const error = t.type === 'error'
        const Icon = success ? CheckCircle : AlertCircle
        return (
          <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 260, maxWidth: 360, padding: '12px 14px', borderRadius: 12, background: error ? 'var(--danger)' : success ? 'var(--secondary)' : 'var(--info)', color: 'white', boxShadow: 'var(--shadow-lg)', pointerEvents: 'auto' }}>
            <Icon size={16} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{t.message}</div>
              {t.sub && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{t.sub}</div>}
            </div>
            <button type="button" onClick={() => onRemove(t.id)} style={{ border: 0, background: 'transparent', color: 'white', cursor: 'pointer', opacity: 0.8, padding: 2 }}>
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function useToastStack() {
  const [toasts, setToasts] = useState([])
  const showToast = useCallback((message, type = 'success', sub = '') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, sub }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])
  const removeToast = useCallback(id => setToasts(prev => prev.filter(t => t.id !== id)), [])
  return { toasts, showToast, removeToast }
}

// ── Rate Chart mini display ───────────────────────────────────────────────────
function RateChartMini({ rateChart, expanded, onToggle }) {
  if (!rateChart) return null
  const entries = Object.entries(rateChart).filter(([k, v]) => v > 0 && k !== 'Others')
  return (
    <div style={{ marginTop:12 }}>
      <button type="button" onClick={onToggle} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:700, color:'var(--secondary)', padding:0 }}>
        Rate Chart {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
      </button>
      {expanded && (
        <div style={{ marginTop:8, borderRadius:8, overflow:'hidden', border:'1px solid var(--border-light)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px', padding:'5px 10px', background:'var(--secondary-light)', fontSize:10.5, fontWeight:700, color:'var(--secondary)', textTransform:'uppercase' }}>
            <span>Item</span><span style={{ textAlign:'right' }}>₹/kg</span>
          </div>
          {entries.map(([ item, rate], i) => (
            <div key={item} style={{ display:'grid', gridTemplateColumns:'1fr 80px', padding:'5px 10px', fontSize:12, borderTop: i > 0 ? '1px solid var(--border-light)' : 'none', background: i%2===0 ? 'transparent' : 'var(--bg)' }}>
              <span style={{ color:'var(--text-secondary)' }}>{item}</span>
              <span style={{ textAlign:'right', fontWeight:700, color:'var(--secondary)' }}>₹{rate}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Rate Chart editor ─────────────────────────────────────────────────────────
function RateChartEditor({ rateChart, onChange }) {
  const safe = rateChart || {}
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 100px', padding:'6px 10px', background:'var(--secondary-light)', borderRadius:'8px 8px 0 0', fontSize:10.5, fontWeight:700, color:'var(--secondary)', textTransform:'uppercase' }}>
        <span>Item</span><span style={{ textAlign:'right' }}>Rate (₹/kg)</span>
      </div>
      <div style={{ border:'1px solid var(--border-light)', borderTop:'none', borderRadius:'0 0 8px 8px', overflow:'hidden' }}>
        {RATE_CHART_ITEMS.map((item, idx) => (
          <div key={item} style={{ display:'grid', gridTemplateColumns:'1fr 100px', padding:'6px 10px', alignItems:'center', borderTop: idx > 0 ? '1px solid var(--border-light)' : 'none', background: idx%2===0 ? 'transparent' : 'var(--bg)' }}>
            <span style={{ fontSize:12.5, color:'var(--text-secondary)' }}>{item}</span>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'var(--text-muted)', pointerEvents:'none' }}>₹</span>
              <input type="number" min={0} step={0.5} inputMode="decimal" value={safe[item] ?? ''} onChange={e => onChange({ ...safe, [item]: parseFloat(e.target.value) || 0 })} style={{ width:'100%', padding:'4px 8px 4px 20px', fontSize:12.5, fontWeight:700, textAlign:'right', border:'1.5px solid var(--border)', borderRadius:6, background:'var(--surface)' }}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Coverage Selector ─────────────────────────────────────────────────────────
// FIX: Added dropdownRef + click-outside handler to close sector dropdown
function CoverageSelector({ city, sectors, societies, onSectors, onSocieties }) {
  const { CITY_SECTORS, locations } = useApp()
  const [openSec, setOpenSec] = useState(false)
  const [customSocInput, setCustomSocInput] = useState('')
  const [secSearch, setSecSearch] = useState('')
  const dropdownRef = useRef(null)

  const safeSectors   = Array.isArray(sectors)   ? sectors   : []
  const safeSocieties = Array.isArray(societies) ? societies : []

  // Close sector dropdown when clicking outside
  useEffect(() => {
    if (!openSec) return
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenSec(false)
        setSecSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openSec])

  const sectorOptions = useMemo(() => CITY_SECTORS[city || 'Gurgaon'] || [], [city])
  const availableSocieties = useMemo(() => {
    if (!safeSectors.length) return []
    return safeSectors.flatMap(s => locations.sectorSocieties?.[`${city || 'Gurgaon'}::${s}`] || [])
  }, [safeSectors, city, locations.sectorSocieties])

  const filteredSectors = useMemo(() => {
    const q = secSearch.toLowerCase().trim()
    if (!q) return sectorOptions
    return sectorOptions.filter(s => s.toLowerCase().includes(q))
  }, [sectorOptions, secSearch])

  const toggleSector = (s) => {
    if (safeSectors.includes(s)) {
      onSectors(safeSectors.filter(x => x !== s))
      const removedSocs = locations.sectorSocieties?.[`${city || 'Gurgaon'}::${s}`] || []
      onSocieties(safeSocieties.filter(soc => !removedSocs.includes(soc)))
    } else {
      if (safeSectors.length >= 3) return
      onSectors([...safeSectors, s])
    }
  }

  const toggleSociety = (soc) => {
    if (safeSocieties.includes(soc)) { onSocieties(safeSocieties.filter(s => s !== soc)) }
    else { if (safeSocieties.length >= 5) return; onSocieties([...safeSocieties, soc]) }
  }

  const addCustomSociety = () => {
    const trimmed = customSocInput.trim()
    if (!trimmed || safeSocieties.includes(trimmed) || safeSocieties.length >= 5) return
    onSocieties([...safeSocieties, trimmed]); setCustomSocInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Sectors */}
      <div className="form-group" style={{ margin: 0 }}>
        <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize: 11.5 }}>
          <span>Sectors <span className="required">*</span></span>
          <span style={{ fontSize:10.5, fontWeight:400, color:'var(--text-muted)' }}>Max 2 ({safeSectors.length}/2)</span>
        </label>
        <div ref={dropdownRef} style={{ position:'relative' }}>
          <div
            onClick={() => setOpenSec(o => !o)}
            style={{ padding:'8px 10px', border:`1.5px solid ${openSec ? 'var(--secondary)' : 'var(--border)'}`, borderRadius:'var(--radius-sm)', cursor:'pointer', background:'var(--surface)', minHeight:40, display:'flex', alignItems:'center', flexWrap:'wrap', gap:5, boxShadow: openSec ? '0 0 0 3px rgba(27,94,53,0.12)' : 'none', fontSize: 12.5 }}
          >
            {safeSectors.length === 0 ? (
              <span style={{ color:'var(--text-muted)' }}>Select up to 2 sectors…</span>
            ) : safeSectors.map(s => (
              <span key={s} style={{ background:'var(--secondary-light)', color:'var(--secondary)', borderRadius:20, padding:'2px 9px', fontSize:11.5, fontWeight:600, display:'inline-flex', alignItems:'center', gap:4 }}>
                {s}
                <button type="button" onClick={e => { e.stopPropagation(); toggleSector(s) }} style={{ border:'none', background:'none', cursor:'pointer', color:'var(--secondary)', padding:0, lineHeight:1, display:'flex', alignItems:'center' }}>
                  <X size={11} />
                </button>
              </span>
            ))}
            <ChevronDown size={13} style={{ marginLeft:'auto', color:'var(--text-muted)', flexShrink:0, transform: openSec ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}/>
          </div>
          {openSec && (
            <div style={{ position:'absolute', bottom:'calc(100% + 4px)', left:0, right:0, zIndex:100, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', boxShadow:'var(--shadow-md)', overflow:'hidden' }}>
              <div style={{ padding:'8px 8px', borderBottom:'1px solid var(--border-light)' }}>
                <input
                  autoFocus
                  value={secSearch}
                  onChange={e => setSecSearch(e.target.value)}
                  placeholder="Search sectors…"
                  style={{ width:'100%', fontSize:12.5, border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', outline:'none' }}
                />
              </div>
              <div style={{ maxHeight:180, overflowY:'auto', padding:5 }}>
                {filteredSectors.length === 0 ? (
                  <div style={{ padding:'10px 8px', fontSize:12, color:'var(--text-muted)', textAlign:'center' }}>No results</div>
                ) : filteredSectors.map(s => {
                  const selected = safeSectors.includes(s)
                  const disabled = !selected && safeSectors.length >= 2
                  return (
                    <button key={s} type="button" onClick={() => { if (!disabled) toggleSector(s) }} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', textAlign:'left', padding:'7px 10px', borderRadius:6, border:'none', background: selected ? 'var(--secondary-light)' : 'transparent', color: selected ? 'var(--secondary)' : disabled ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: selected ? 700 : 400, fontSize:12.5, cursor: disabled ? 'not-allPending' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
                      <span>{s}</span>
                      {selected && <span style={{ fontSize:11, color:'var(--secondary)' }}>✓</span>}
                    </button>
                  )
                })}
              </div>
              {safeSectors.length >= 2 && (
                <div style={{ padding:'6px 10px', background:'var(--warning-bg)', fontSize:11, color:'#92400E', fontWeight:600 }}>
                  Max 2 sectors reached
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Societies */}
      {safeSectors.length > 0 && (
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize: 11.5 }}>
            <span>Societies</span>
            <span style={{ fontSize:10.5, fontWeight:400, color: safeSocieties.length >= 5 ? 'var(--danger)' : 'var(--text-muted)' }}>
              {safeSocieties.length}/5 selected
            </span>
          </label>
          {availableSocieties.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8, maxHeight:84, overflowY:'auto', padding:'6px 8px', border:'1px solid var(--border-light)', borderRadius:8, background:'var(--bg)' }}>
              {availableSocieties.map(soc => {
                const selected = safeSocieties.includes(soc)
                const disabled = !selected && safeSocieties.length >= 5
                return (
                  <button key={soc} type="button" onClick={() => !disabled && toggleSociety(soc)} style={{ padding:'3px 10px', borderRadius:20, border:`1.5px solid ${selected ? 'var(--secondary)' : 'var(--border)'}`, background: selected ? 'var(--secondary-light)' : 'var(--surface)', color: selected ? 'var(--secondary)' : disabled ? 'var(--text-muted)' : 'var(--text-secondary)', fontWeight: selected ? 700 : 400, fontSize:11.5, cursor: disabled ? 'not-allPending' : 'pointer', opacity: disabled ? 0.5 : 1, transition:'all 0.12s' }}>
                    {selected && '✓ '}{soc}
                  </button>
                )
              })}
            </div>
          )}
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <input
              value={customSocInput}
              onChange={e => setCustomSocInput(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter') { e.preventDefault(); addCustomSociety() } }}
              placeholder={safeSocieties.length >= 5 ? 'Max 5 reached' : 'Add custom society name…'}
              disabled={safeSocieties.length >= 5}
              style={{ flex:1, fontSize:12.5 }}
            />
            <button type="button" onClick={addCustomSociety} disabled={!customSocInput.trim() || safeSocieties.length >= 5} className="btn btn-secondary btn-sm" style={{ fontSize: 11.5, flexShrink: 0 }}>
              + Add
            </button>
          </div>
          {/* Selected society chips */}
          {safeSocieties.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:8 }}>
              {safeSocieties.map(soc => (
                <span key={soc} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:'var(--secondary-light)', color:'var(--secondary)', fontSize:11.5, fontWeight:600, border:'1px solid rgba(27,94,53,0.2)' }}>
                  {soc}
                  <button type="button" onClick={() => toggleSociety(soc)} style={{ border:'none', background:'none', cursor:'pointer', color:'var(--secondary)', padding:0, display:'flex', alignItems:'center' }}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Executive sector search ───────────────────────────────────────────────────
function ExecutiveSectorSearch({ partners, onAddNew, canAddPartner = false }) {
  const { CITIES, CITY_SECTORS, locations } = useApp()
  const [city,    setCity]    = useState('Gurgaon')
  const [sector,  setSector]  = useState('')
  const [society, setSociety] = useState('')

  const sectorOptions  = CITY_SECTORS[city] || []
  const societyOptions = useMemo(() => {
    if (!city || !sector) return []
    return locations.sectorSocieties?.[`${city}::${sector}`] || []
  }, [city, sector, locations.sectorSocieties])

  const activePartners = useMemo(() => partners.filter(isPartnerActive), [partners])
  const matchingPartners = useMemo(() => {
    if (!sector) return []
    return activePartners.filter(p => {
      const secs = Array.isArray(p.sectors) ? p.sectors : []
      const socs = Array.isArray(p.societies) ? p.societies : []
      return secs.includes(sector) || (society && socs.includes(society))
    })
  }, [activePartners, sector, society])

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:600 }}>Find Your Pickup Partner</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Select your area to find the assigned pickup partner</div>
        </div>
        {canAddPartner && (
          <button className="btn btn-primary btn-sm" onClick={onAddNew}><Plus size={14}/> Add Partner</button>
        )}
      </div>
      <div className="card" style={{ marginBottom:20 }}>
        <div className="card-header" style={{ background:'var(--primary-light)' }}>
          <MapPin size={16} color="var(--primary)"/>
          <div className="card-title" style={{ color:'var(--primary)' }}>Search by Area</div>
        </div>
        <div className="card-body">
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14 }}>
            {[
              { step:'1', label:'City', content:(<select value={city} onChange={e => { setCity(e.target.value); setSector(''); setSociety('') }} style={{ width:'100%', fontSize:13 }}>{CITIES.map(c => <option key={c}>{c}</option>)}</select>) },
              { step:'2', label:'Sector / Area', content:(<select value={sector} onChange={e => { setSector(e.target.value); setSociety('') }} disabled={!city} style={{ width:'100%', fontSize:13 }}><option value="">— Select Sector —</option>{sectorOptions.map(s => <option key={s}>{s}</option>)}</select>) },
              { step:'3', label:'Society (optional)', content: societyOptions.length > 0 ? (
                <select value={society} onChange={e => setSociety(e.target.value)} disabled={!sector} style={{ width:'100%', fontSize:13 }}>
                  <option value="">— All societies —</option>
                  {societyOptions.map(s => <option key={s}>{s}</option>)}
                </select>
              ) : (<input value={society} onChange={e => setSociety(e.target.value)} placeholder={sector ? 'Type society…' : 'Select sector first'} disabled={!sector} style={{ width:'100%', fontSize:13 }}/>) },
            ].map(({ step, label, content }) => (
              <div key={step}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <div style={{ width:20, height:20, borderRadius:'50%', background:'var(--primary)', color:'#fff', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{step}</div>
                  <label style={{ margin:0, fontSize:12.5, fontWeight:700, color:'var(--text-secondary)' }}>{label}</label>
                </div>
                {content}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!sector ? (
        <div style={{ padding:'48px 24px', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
          <MapPin size={36} color="var(--border)" style={{ display:'block', margin:'0 auto 12px' }}/>
          <div style={{ fontWeight:600, fontSize:14, marginBottom:4, color:'var(--text-secondary)' }}>Select your sector to continue</div>
          <div>Your assigned pickup partner's contact will appear here.</div>
        </div>
      ) : matchingPartners.length === 0 ? (
        <div className="empty-state" style={{ padding:40 }}>
          <div className="empty-icon"><Users size={22}/></div>
          <h3>No partner assigned yet</h3>
          <p>No active pickup partner covers {sector}{society ? ` / ${society}` : ''} yet.</p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
          {matchingPartners.map(k => (
            <div key={k.id} className="card" style={{ borderLeft:'3px solid var(--secondary)' }}>
              <div className="card-body">
                <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:12 }}>
                  {k.photo ? (
                    <img src={k.photo} alt={k.name} style={{ width:48, height:48, borderRadius:12, objectFit:'cover', flexShrink:0, border:'2px solid var(--secondary-light)' }} />
                  ) : (
                    <div style={{ width:48, height:48, background:'var(--secondary-light)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, color:'var(--secondary)', flexShrink:0 }}>
                      {(k.name||'?')[0].toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:15, marginBottom:3 }}>{k.name}</div>
                    <div style={{ fontSize:12.5, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:4 }}><Phone size={11}/> {k.mobile||'—'}</div>
                   </div>
                </div>
                <div style={{ background:'var(--secondary-light)', borderRadius:10, padding:'12px 14px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--secondary)', textTransform:'uppercase', marginBottom:4 }}>Call for Pickup</div>
                  <div style={{ fontSize:18, fontWeight:800, color:'var(--secondary)', fontFamily:'var(--font-display)' }}>{k.mobile}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Per-partner payment summary ───────────────────────────────────────────────
function PartnerPaymentSummaryCards({ partner, raddiRecords }) {
  const stats = useMemo(() => {
    if (!partner?.name || !Array.isArray(raddiRecords)) return { totalPickups:0, totalAmount:0, received:0, pending:0 }
    const partnerName = partner.name.toLowerCase()
    const records = raddiRecords.filter(r => (r.PickupPartnerName || '').toLowerCase() === partnerName)
    const tx = Array.isArray(partner.transactions) ? partner.transactions : []
    const fallbackTotal = records.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0) || tx.reduce((s, r) => s + (Number(r.value) || 0), 0)
    const fallbackReceived = records.reduce((s, r) => s + Math.min(Number(r.totalAmount) || 0, Number(r.amountPaid) || 0), 0) || tx.reduce((s, r) => s + (Number(r.paid) || 0), 0)
    const hasPartnerPending = partner.pendingAmount !== undefined && partner.pendingAmount !== null && !Number.isNaN(Number(partner.pendingAmount))
    const totalAmount = Number(partner.totalValue) || fallbackTotal
    const received = Number(partner.amountReceived) || fallbackReceived
    const pending = hasPartnerPending
      ? Math.max(0, Number(partner.pendingAmount) || 0)
      : Math.max(0, totalAmount - received)
    return { totalPickups: Number(partner.totalPickups) || records.length || tx.length, totalAmount, received, pending }
  }, [raddiRecords, partner])

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:12, padding:'10px', background:'var(--bg)', borderRadius:10, border:'1px solid var(--border-light)' }}>
      {[
        { label:'Pickups',     value:stats.totalPickups,             color:'var(--text-primary)', icon:Package },
        { label:'Total (₹)',   value:fmtCurrency(stats.totalAmount), color:'var(--primary)',       icon:IndianRupee },
        { label:'Pending (₹)', value:fmtCurrency(stats.pending),     color: stats.pending > 0 ? 'var(--danger)' : 'var(--secondary)', icon:AlertCircle },
      ].map(item => {
        const Icon = item.icon
        return (
          <div key={item.label} style={{ textAlign:'center', padding:'6px 4px' }}>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:4 }}><Icon size={13} color={item.color}/></div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, color:item.color, lineHeight:1 }}>{item.value}</div>
            <div style={{ fontSize:9.5, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em', marginTop:2 }}>{item.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Document upload + view field ──────────────────────────────────────────────
// FIX: Aadhaar and Photo view now correctly handles data URIs
function DocUpload({ label, icon: Icon, value, accept, onChange, onRemove, preview = false }) {
  const fileSelected = isFileValue(value)
  const [objectUrl, setObjectUrl] = useState('')
  const viewUrl = fileSelected ? objectUrl : value

  useEffect(() => {
    if (!fileSelected) {
      setObjectUrl('')
      return undefined
    }

    const url = URL.createObjectURL(value)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [fileSelected, value])

  const handleView = () => {
    if (!viewUrl) return
    // Handle data URI (base64)
    if (typeof viewUrl === 'string' && viewUrl.startsWith('data:')) {
      if (viewUrl.startsWith('data:image/') || preview) {
        // Open image in new window
        const win = window.open('', '_blank')
        win.document.write(`<!DOCTYPE html><html><head><title>${label}</title><style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;}</style></head><body><img src="${viewUrl}" style="max-width:100vw;max-height:100vh;object-fit:contain;" /></body></html>`)
        win.document.close()
      } else if (viewUrl.startsWith('data:application/pdf')) {
        // Decode and open PDF
        const byteString = atob(viewUrl.split(',')[1])
        const mimeString = 'application/pdf'
        const ab = new ArrayBuffer(byteString.length)
        const ia = new Uint8Array(ab)
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
        const blob = new Blob([ab], { type: mimeString })
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
      } else {
        // Generic: open in new tab directly
        const win = window.open('', '_blank')
        win.document.write(`<!DOCTYPE html><html><head><title>${label}</title></head><body><img src="${viewUrl}" style="max-width:100%;"/></body></html>`)
        win.document.close()
      }
    } else {
      window.open(viewUrl, '_blank')
    }
  }

  return (
    <div className="form-group" style={{ margin: 0 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
        <Icon size={12} color="var(--info)" />{label}
        {value && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: fileSelected ? 'var(--info)' : 'var(--secondary)', background: fileSelected ? 'var(--info-bg)' : 'var(--secondary-light)', padding: '1px 8px', borderRadius: 20, border: fileSelected ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(27,94,53,0.2)' }}>
            <ShieldCheck size={9} /> {fileSelected ? 'Selected' : 'Uploaded'}
          </span>
        )}
      </label>
      {value ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {preview && viewUrl && (
            <img
              src={viewUrl}
              alt={label}
              onClick={handleView}
              style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: '1.5px solid var(--secondary)', display: 'block', flexShrink: 0, cursor: 'pointer' }}
              title="Click to view full size"
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {fileSelected && (
              <div style={{ maxWidth: 150, fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {value.name}
              </div>
            )}
            <button
              type="button"
              onClick={handleView}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid var(--secondary)', background: 'var(--secondary-light)', cursor: 'pointer', fontSize: 11.5, color: 'var(--secondary)', fontWeight: 700 }}
            >
              <Eye size={11} /> View
            </button>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid var(--info)', background: 'var(--info-bg)', cursor: 'pointer', fontSize: 11.5, color: 'var(--info)', fontWeight: 600 }}
            >
              <Upload size={11} /> Replace
              <input type="file" accept={accept} style={{ display: 'none' }} onChange={onChange} />
            </label>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid var(--danger)', background: 'var(--danger-bg)', cursor: 'pointer', fontSize: 11.5, color: 'var(--danger)', fontWeight: 600 }}
              >
                <X size={11} /> Remove
              </button>
            )}
          </div>
        </div>
      ) : (
        <label className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed', cursor: 'pointer', fontSize: 11.5, padding: '8px 10px' }}>
          <Upload size={12} /> Upload {label}
          <input type="file" accept={accept} style={{ display: 'none' }} onChange={onChange} />
        </label>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function PickupPartners() {
  const { PickupPartners: rawPartners, raddiRecords, addPartner, updatePartner, deletePartner, CITIES, CITY_SECTORS, locations, masterData } = useApp()
  const { items: RATE_CHART_ITEMS, defaults: DEFAULT_RATE_CHART } = useMemo(() => buildRateChartDefaults(masterData.rstItemsFull), [masterData.rstItemsFull])
  const { role } = useRole()
  
  const canEditPartner = role === 'admin' || role === 'manager'
  const canDeletePartner = role === 'admin'

  const partners = useMemo(() => Array.isArray(rawPartners) ? rawPartners : [], [rawPartners])

  // Managers can also toggle active/inactive
  const canToggleStatus = role === 'admin' || role === 'manager'
  const { toasts, showToast, removeToast } = useToastStack()

  const [statusTab, setStatusTab] = useState('active')
  const activeCount   = useMemo(() => partners.filter(isPartnerActive).length,  [partners])
  const inactiveCount = useMemo(() => partners.filter(p => !isPartnerActive(p)).length, [partners])

  const togglePartnerStatus = useCallback(async (k) => {
    try {
      const nextActive = !isPartnerActive(k)
      await updatePartner(k.id, { isActive: nextActive })
      showToast(nextActive ? 'Partner reactivated' : 'Partner marked inactive', 'success', k.name || '')
    } catch (e) {
      console.error('Status toggle error:', e)
      showToast('Status update failed', 'error', e?.message || 'Please try again.')
    }
  }, [updatePartner, showToast])

  const [modal,          setModal]          = useState(false)
  const [form,           setForm]           = useState({
    name:'', mobile:'', email:'', city:'Gurgaon',
    sectors:[], societies:[], area:'',
    rateChart:{ ...DEFAULT_RATE_CHART },
    photo: null, photoPath: null, aadhaarDoc: null, aadhaarPath: null,
  })
  const [editing,        setEditing]        = useState(null)
  const [saving,         setSaving]         = useState(false)
  const [expandedRates,  setExpandedRates]  = useState({})
  const [showRateEditor, setShowRateEditor] = useState(false)
  const [error,          setError]          = useState('')

  const [dirSearch,        setDirSearch]        = useState('')
  const [dirFilterCity,    setDirFilterCity]    = useState('')
  const [dirFilterSector,  setDirFilterSector]  = useState('')
  const [dirFilterSociety, setDirFilterSociety] = useState('')

  const dirSectorOptions  = useMemo(() => dirFilterCity ? (CITY_SECTORS[dirFilterCity]||[]) : [], [dirFilterCity])
  const dirSocietyOptions = useMemo(() => {
    if (!dirFilterCity || !dirFilterSector) return []
    return locations.sectorSocieties?.[`${dirFilterCity}::${dirFilterSector}`] || []
  }, [dirFilterCity, dirFilterSector, locations.sectorSocieties])

  const filteredPartners = useMemo(() => {
    const q = dirSearch.toLowerCase().trim()
    return partners.filter(k => {
      const matchSearch  = !q || k.name?.toLowerCase().includes(q) || k.mobile?.includes(q)
      const matchCity    = !dirFilterCity    || k.city   === dirFilterCity
      const matchSector  = !dirFilterSector  || (k.sectors  ||[]).includes(dirFilterSector)
      const matchSociety = !dirFilterSociety || (k.societies||[]).includes(dirFilterSociety)
      const matchStatus  = statusTab === 'active' ? isPartnerActive(k) : !isPartnerActive(k)
      return matchSearch && matchCity && matchSector && matchSociety && matchStatus
    })
  }, [partners, dirSearch, dirFilterCity, dirFilterSector, dirFilterSociety, statusTab])

  const hasDirFilters = dirSearch || dirFilterCity || dirFilterSector || dirFilterSociety
  const clearDirFilters = () => { setDirSearch(''); setDirFilterCity(''); setDirFilterSector(''); setDirFilterSociety('') }

  const handleFileSelect = (key, label) => (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const hadFile = !!form[key]

    const validationError = validatePartnerFile(file, key)
    if (validationError) {
      showToast(`${label} not accepted`, 'error', validationError)
      e.target.value = ''
      return
    }

    setForm(f => ({ ...f, [key]: file }))
    showToast(`${label} ${hadFile ? 'replaced' : 'selected'}`, 'success', `${file.name} will upload when you save.`)
    e.target.value = ''
  }

  const open = useCallback((k = null) => {
    setEditing(k); setError(''); setShowRateEditor(false)
    if (k) {
      setForm({
        name: k.name||'', mobile: k.mobile||'', email: k.email||'',
        city: k.city||'Gurgaon', sectors: Array.isArray(k.sectors)?[...k.sectors]:[],
        societies: Array.isArray(k.societies)?[...k.societies]:[], area: k.area||'',
        rateChart: { ...DEFAULT_RATE_CHART, ...(k.rateChart||{}) },
        photo: k.photo || k.photoUrl || null,
        photoPath: k.photoPath || k.photoFile?.storagePath || null,
        aadhaarDoc: k.aadhaarDoc || k.aadhaarUrl || k.aadhaarDocument || null,
        aadhaarPath: k.aadhaarPath || k.aadhaarFile?.storagePath || null,
      })
    } else {
      setForm({ name:'', mobile:'', email:'', city:'Gurgaon', sectors:[], societies:[], area:'', rateChart:{ ...DEFAULT_RATE_CHART }, photo: null, photoPath: null, aadhaarDoc: null, aadhaarPath: null })
    }
    setModal(true)
  }, [DEFAULT_RATE_CHART])

  const close = useCallback(() => { setModal(false); setEditing(null); setError(''); setShowRateEditor(false) }, [])

  const save = useCallback(async () => {
    if (!canEditPartner) { setError('Only admins and managers can add or edit pickup partners.'); return }
    if (!form.name?.trim())   { setError('Name is required.'); return }
    if (!form.mobile?.trim()) { setError('Mobile number is required.'); return }
    setSaving(true); setError('')
    try {
      const area = [...(form.sectors||[]), ...(form.societies||[])].filter(Boolean).join(', ') || form.area || ''
      editing?.id ? await updatePartner(editing.id, { ...form, area }) : await addPartner({ ...form, area })
      showToast(editing?.id ? 'Pickup partner updated' : 'Pickup partner added', 'success', form.name.trim())
      close()
    } catch (err) {
      const message = err?.message || 'The partner details were not saved.'
      setError(message)
      showToast('Save failed', 'error', message)
    }
    finally { setSaving(false) }
  }, [form, editing, addPartner, updatePartner, close, showToast, canEditPartner])

  // FIX: Delete clears all partner data including photo/aadhaar (they're in state)
  const removeK = useCallback(async (id) => {
    if (!canDeletePartner) return
    if (!window.confirm('Remove this pickup partner? This will delete all their data including documents.')) return
    try {
      await deletePartner(id)
      showToast('Pickup partner removed', 'success')
    } catch (err) {
      console.error(err)
      showToast('Delete failed', 'error', err?.message || 'The partner was not removed.')
    }
  }, [canDeletePartner, deletePartner, showToast])

  const toggleRate = useCallback((id) => setExpandedRates(prev => ({ ...prev, [id]: !prev[id] })), [])

  const isExecutive = role === 'executive'

  // ── REDESIGNED COMPACT 2-COLUMN MODAL ───────────────────────────────────────
  function renderModal() {
    const rateChartSafe = form.rateChart || DEFAULT_RATE_CHART
    return (
      <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && close()}>
        <style>{`
          @media (max-width: 768px) {
            .partner-modal-grid { grid-template-columns: 1fr !important; }
            .partner-modal-footer { flex-direction: column !important; }
            .partner-modal-footer .btn { width: 100% !important; margin-left: 0 !important; }
          }
        `}</style>
        <div className="modal" style={{ maxWidth: 1080, width: '96vw', maxHeight: '96vh', overflow: 'visible' }}>

          {/* Header — compact */}
          <div className="modal-header" style={{ padding: '14px 22px 12px' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--secondary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <UserCheck size={16} color="var(--secondary)" />
            </div>
            <div style={{ flex: 1 }}>
              <div className="modal-title" style={{ fontSize: 15 }}>{editing ? 'Edit Pickup Partner' : 'Add New Pickup Partner'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                {editing?.id ? `ID: ${editing.id}` : 'Fill in partner details below'}
              </div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={close}>
              <X size={16} />
            </button>
          </div>

          {/* Body — 2-column grid */}
          <div className="modal-body" style={{ padding: '16px 22px' }}>
            {error && (
              <div className="alert-strip alert-danger" style={{ marginBottom: 12 }}>
                <AlertCircle size={13} /> {error}
              </div>
            )}

            <div className="partner-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 22 }}>

              {/* ═══ LEFT COLUMN ═══ */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Personal Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: -2 }}>
                  <Users size={11} color="var(--primary)" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Personal Info</span>
                </div>

                {/* Row 1: Name + Mobile */}
                <div className="partner-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11.5 }}>Full Name <span className="required">*</span></label>
                    <input
                      value={form.name || ''}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Suresh Bhai"
                      autoFocus
                      style={{ padding: '7px 10px', fontSize: 13 }}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11.5 }}>Mobile <span className="required">*</span></label>
                    <input
                      value={form.mobile || ''}
                      onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))}
                      placeholder="10-digit"
                      maxLength={10}
                      inputMode="numeric"
                      style={{ padding: '7px 10px', fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Row 2: City + Email */}
                <div className="partner-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11.5 }}>City</label>
                    <input
                      list="partner-cities"
                      value={form.city || 'Gurgaon'}
                      onChange={e => setForm(f => ({ ...f, city: e.target.value, sectors: [], societies: [] }))}
                      placeholder="Type or choose city"
                      style={{ padding: '7px 10px', fontSize: 13 }}
                    />
                    <datalist id="partner-cities">
                      {CITIES.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11.5 }}>Email <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                    <input
                      type="email"
                      value={form.email || ''}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="partner@email.com"
                      style={{ padding: '7px 10px', fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Coverage Area */}
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border-light)', flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <MapPin size={11} /> Coverage Area
                  </div>
                  <CoverageSelector
                    city={form.city || 'Gurgaon'}
                    sectors={form.sectors || []}
                    societies={form.societies || []}
                    onSectors={s => setForm(f => ({ ...f, sectors: s }))}
                    onSocieties={s => setForm(f => ({ ...f, societies: s }))}
                  />
                </div>
              </div>

              {/* ═══ RIGHT COLUMN ═══ */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Rate Chart — always visible, compact 2-col grid */}
                <div style={{ background: 'var(--secondary-light)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(27,94,53,0.2)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <IndianRupee size={11} /> Rate Chart (₹/kg)
                  </div>
                  <div className="partner-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'rgba(27,94,53,0.12)', borderRadius: 6, overflow: 'hidden' }}>
                    {RATE_CHART_ITEMS.map(item => (
                      <div key={item} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: 'rgba(255,255,255,0.85)', gap: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{item}</span>
                        <div style={{ position: 'relative', width: 56, flexShrink: 0 }}>
                          <span style={{ position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-muted)', pointerEvents: 'none' }}>₹</span>
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            inputMode="decimal"
                            onWheel={(e) => e.target.blur()}
                            value={rateChartSafe[item] ?? ''}
                            onChange={e => {
                              let val = e.target.value;
                              if (/^0\d/.test(val)) val = val.replace(/^0+/, '');
                              setForm(f => ({ ...f, rateChart: { ...rateChartSafe, [item]: val } }));
                            }}
                            style={{ width: '100%', padding: '3px 4px 3px 16px', fontSize: 11.5, fontWeight: 700, textAlign: 'right', border: '1px solid var(--border)', borderRadius: 4, background: 'white' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Documents */}
                <div style={{ background: 'rgba(59,130,246,0.04)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(59,130,246,0.12)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--info)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <FileText size={11} /> Documents <span sty le={{ fontSize: 9.5, fontWeight: 400, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                  </div>
                  <div className="partner-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <DocUpload
                      label="Photo"
                      icon={Image}
                      value={form.photo}
                      accept="image/*"
                      preview
                      onChange={handleFileSelect('photo', 'Photo')}
                      onRemove={() => {
                        setForm(f => ({ ...f, photo: null }))
                        showToast('Photo removed', 'info')
                      }}
                    />
                    <DocUpload
                      label="Aadhaar"
                      icon={FileText}
                      value={form.aadhaarDoc}
                      accept="image/*,application/pdf"
                      onChange={handleFileSelect('aadhaarDoc', 'Aadhaar document')}
                      onRemove={() => {
                        setForm(f => ({ ...f, aadhaarDoc: null }))
                        showToast('Aadhaar document removed', 'info')
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer partner-modal-footer" style={{ padding: '10px 22px', background: 'var(--surface)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
            <button className="btn btn-ghost btn-sm" onClick={close} disabled={saving}>Cancel</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={save}
              disabled={saving || !form.name?.trim() || !form.mobile?.trim()}
              style={{ minWidth: 130, padding: '8px 20px', fontSize: 13 }}
            >
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Pickup Partner'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Executive view ────────────────────────────────────────────────────────
  if (isExecutive) {
    return (
      <div className="page-body">
        <ExecutiveSectorSearch partners={partners} />
        <ToastStack toasts={toasts} onRemove={removeToast} />
      </div>
    )
  }

  // ── Admin / Manager: Directory ────────────────────────────────────────────
  return (
    <div className="page-body">

      {/* ── Header Bar ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:17, fontWeight:700, letterSpacing:'-0.01em' }}>Pickup Partners</div>
            <div style={{ fontSize:11.5, color:'var(--text-muted)', marginTop:1 }}>{partners.length} partner{partners.length !== 1 ? 's' : ''} registered</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Tabs as pill toggles */}
          <div style={{ display:'flex', background:'var(--border-light)', borderRadius:8, padding:3, gap:2 }}>
            <button onClick={() => setStatusTab('active')}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 14px', borderRadius:6, border:'none', fontSize:12.5, fontWeight:600, cursor:'pointer', transition:'all 0.15s',
                background: statusTab === 'active' ? 'var(--secondary)' : 'transparent',
                color: statusTab === 'active' ? 'white' : 'var(--text-muted)',
                boxShadow: statusTab === 'active' ? '0 1px 4px rgba(27,94,53,0.25)' : 'none' }}>
              <UserCheck size={13}/> Active
              <span style={{ fontSize:10, padding:'0 5px', borderRadius:10, fontWeight:700,
                background: statusTab === 'active' ? 'rgba(255,255,255,0.25)' : 'var(--border)',
                color: statusTab === 'active' ? 'white' : 'var(--text-muted)' }}>{activeCount}</span>
            </button>
            <button onClick={() => setStatusTab('inactive')}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 14px', borderRadius:6, border:'none', fontSize:12.5, fontWeight:600, cursor:'pointer', transition:'all 0.15s',
                background: statusTab === 'inactive' ? 'var(--danger)' : 'transparent',
                color: statusTab === 'inactive' ? 'white' : 'var(--text-muted)',
                boxShadow: statusTab === 'inactive' ? '0 1px 4px rgba(239,68,68,0.25)' : 'none' }}>
              <UserX size={13}/> Inactive
              <span style={{ fontSize:10, padding:'0 5px', borderRadius:10, fontWeight:700,
                background: statusTab === 'inactive' ? 'rgba(255,255,255,0.25)' : 'var(--border)',
                color: statusTab === 'inactive' ? 'white' : 'var(--text-muted)' }}>{inactiveCount}</span>
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => open()} style={{ padding:'7px 16px' }}>
            <Plus size={14}/> Add Partner
          </button>
        </div>
      </div>

      {/* ── Compact Filters ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'nowrap', background:'var(--surface)', padding:'10px 14px', borderRadius:'var(--radius-lg)', border:'1px solid var(--border-light)', boxShadow:'var(--shadow-sm)' }}>
        <div style={{ position:'relative', flex: '1 1 auto', minWidth: 200 }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
          <input value={dirSearch} onChange={e => setDirSearch(e.target.value)} placeholder="Search name or mobile…" style={{ paddingLeft:32, fontSize:13, width:'100%', padding:'7px 10px 7px 32px', margin: 0 }}/>
        </div>
        <select value={dirFilterCity} onChange={e => { setDirFilterCity(e.target.value); setDirFilterSector(''); setDirFilterSociety('') }} style={{ fontSize:13, padding:'7px 10px', width:'auto', flexShrink:0, margin: 0 }}>
          <option value="">All Cities</option>
          {CITIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={dirFilterSector} onChange={e => { setDirFilterSector(e.target.value); setDirFilterSociety('') }} disabled={!dirFilterCity} style={{ fontSize:13, padding:'7px 10px', width:'auto', flexShrink:0, margin: 0 }}>
          <option value="">{dirFilterCity ? 'All Sectors' : 'Select city first'}</option>
          {dirSectorOptions.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={dirFilterSociety} onChange={e => setDirFilterSociety(e.target.value)} disabled={!dirFilterSector} style={{ fontSize:13, padding:'7px 10px', width:'auto', flexShrink:0, margin: 0 }}>
          <option value="">{dirFilterSector ? 'All Societies' : 'Select sector'}</option>
          {dirSocietyOptions.map(s => <option key={s}>{s}</option>)}
        </select>
        {hasDirFilters && (
          <button className="btn btn-ghost btn-sm" onClick={clearDirFilters} style={{ fontSize:12, color:'var(--danger)', padding:'6px 12px', flexShrink:0, border:'1px solid var(--danger-bg)' }}>
            <X size={12}/> Clear
          </button>
        )}
        <div style={{ marginLeft:'auto', fontSize:12.5, color:'var(--text-muted)', flexShrink:0, paddingLeft: 10, borderLeft: '1px solid var(--border-light)' }}>
          Showing <strong style={{ color:'var(--text-primary)' }}>{filteredPartners.length}</strong> {statusTab}
        </div>
      </div>

      {/* Partner cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:14 }}>
        {filteredPartners.length === 0 ? (
          <div className="empty-state" style={{ gridColumn:'1/-1', padding:40 }}>
            <div className="empty-icon">
              {statusTab === 'inactive' ? <UserX size={22}/> : <Search size={22}/>}
            </div>
            <h3>{statusTab === 'inactive' ? 'No Inactive Partners' : partners.length === 0 ? 'No pickup partners added' : 'No matches found'}</h3>
            <p>{statusTab === 'inactive' ? 'All partners are currently active.' : partners.length === 0 ? 'Add your first pickup partner.' : 'Try adjusting the filters.'}</p>
            {hasDirFilters && <button className="btn btn-ghost btn-sm" onClick={clearDirFilters} style={{ marginTop:10 }}>Clear Filters</button>}
          </div>
        ) : filteredPartners.map(k => {
          if (!k?.id) return null
          const active = isPartnerActive(k)
          return (
            <div key={k.id} className="card" style={{ borderLeft:`3px solid ${active ? 'var(--secondary)' : 'var(--border)'}`, opacity: active ? 1 : 0.75, transition:'all 0.15s' }}>
              <div style={{ padding:'14px 16px' }}>

                {/* Top row: avatar + info + actions */}
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                  {k.photo ? (
                    <img src={k.photo} alt={k.name} onClick={() => { const w=window.open('','_blank'); w.document.write(`<!DOCTYPE html><html><head><title>${k.name}</title><style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;}</style></head><body><img src="${k.photo}" style="max-width:100vw;max-height:100vh;object-fit:contain;"/></body></html>`); w.document.close() }}
                      style={{ width:44, height:44, borderRadius:10, objectFit:'cover', border:`2px solid ${active ? 'var(--secondary)' : 'var(--border)'}`, cursor:'pointer', flexShrink:0 }} />
                  ) : (
                    <div style={{ width:44, height:44, background: active ? 'var(--secondary-light)' : 'var(--border-light)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)', fontSize:19, fontWeight:700, color: active ? 'var(--secondary)' : 'var(--text-muted)', flexShrink:0 }}>
                      {(k.name||'?')[0].toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                      <span style={{ fontWeight:700, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{k.name||'—'}</span>
                      <span style={{ fontFamily:'monospace', fontSize:9.5, fontWeight:700, color:'white', background: active ? 'var(--secondary)' : 'var(--text-muted)', padding:'1px 5px', borderRadius:4, flexShrink:0 }}>{k.id}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:12, color:'var(--text-muted)' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:3 }}><Phone size={10}/> {k.mobile||'—'}</span>
                       {k.aadhaarDoc && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:10, background:'var(--secondary-light)', color:'var(--secondary)', fontWeight:700 }}>✓ Verified</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:3, flexShrink:0 }}>
                    {canEditPartner && <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => open(k)} style={{ padding:5 }}><Edit2 size={13}/></button>}
                    {canDeletePartner && <button className="btn btn-danger btn-icon btn-sm" title="Delete" onClick={() => removeK(k.id)} style={{ padding:5 }}><Trash2 size={13}/></button>}
                  </div>
                </div>

                {/* Coverage chips */}
                {((k.sectors||[]).length > 0 || k.city) && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                    {k.city && <span style={{ background:'var(--primary-light)', color:'var(--primary)', borderRadius:20, padding:'2px 8px', fontSize:10.5, fontWeight:700 }}>{k.city}</span>}
                    {(k.sectors||[]).map(s => <span key={s} style={{ background:'var(--secondary-light)', color:'var(--secondary)', borderRadius:20, padding:'2px 8px', fontSize:10.5, fontWeight:600 }}>{s}</span>)}
                    {(k.societies||[]).slice(0,3).map(s => <span key={s} style={{ background:'var(--bg)', color:'var(--text-secondary)', borderRadius:20, padding:'2px 7px', fontSize:10, border:'1px solid var(--border-light)' }}>{s}</span>)}
                    {(k.societies||[]).length > 3 && <span style={{ fontSize:10, color:'var(--text-muted)', padding:'2px 4px' }}>+{k.societies.length - 3}</span>}
                  </div>
                )}

                {/* Payment stats row */}
               
                <RateChartMini rateChart={k.rateChart} expanded={!!expandedRates[k.id]} onToggle={() => toggleRate(k.id)}/>

                {/* Status toggle */}
                {canToggleStatus && (
                  <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--border-light)' }}>
                    <button onClick={() => togglePartnerStatus(k)}
                      className={`btn btn-sm ${active ? 'btn-ghost' : 'btn-secondary'}`}
                      style={{ width:'100%', justifyContent:'center', gap:5, fontSize:12, padding:'6px 12px' }}>
                      {active ? <><UserX size={12}/> Mark Inactive</> : <><RefreshCw size={12}/> Reactivate</>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {modal && renderModal()}
      <ToastStack toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
