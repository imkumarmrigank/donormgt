// Frontend/src/pages/SKSOverview.jsx
// ENHANCED: Payment integration in Stock Out, AppContext for shared state
import { useState, useMemo, useCallback } from 'react'
import {
  ArrowDownCircle, ArrowUpCircle, Package, Boxes,
  Plus, X, CheckCircle, Download, Trash2, Edit2,
  MapPin, Calendar, Search,
  ShoppingBag, Shirt, Footprints, Gift, Dumbbell, BookOpen,
  UtensilsCrossed, Armchair, Monitor, Laptop, Wind, Microwave,
  AlertCircle, ChevronDown, ChevronUp,
  IndianRupee, Smartphone, CreditCard, FileText as FileTextIcon,
  Image, Upload, Eye,
} from 'lucide-react'
import { useApp }  from '../context/AppContext'
import { useRole } from '../context/RoleContext'
import { fmtDate, fmtCurrency, exportToExcel } from '../utils/helpers'
import { uploadFileViaSignedUrl } from '../services/api'
import SectorSearchSelect from '../components/SectorSearchSelect'

// ── Toast Component ───────────────────────────────────────────────────────────
function Toast({ toasts, onRemove }) {
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => {
        const CONFIG = {
          success: { bg: 'var(--secondary)', icon: CheckCircle, borderLeft: '#14532D' },
          error:   { bg: 'var(--danger)',    icon: AlertCircle, borderLeft: '#991B1B' },
          info:    { bg: 'var(--info)',      icon: Package,     borderLeft: '#1E3A8A' },
        }
        const cfg  = CONFIG[toast.type] || CONFIG.success
        const Icon = cfg.icon
        return (
          <div key={toast.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: cfg.bg, color: 'white',
              padding: '12px 16px', borderRadius: 12,
              boxShadow: 'var(--shadow-lg)',
              minWidth: 260, maxWidth: 360,
              animation: 'slideUp 0.25s ease',
              borderLeft: `3px solid ${cfg.borderLeft}`,
              pointerEvents: 'auto',
            }}
          >
            <Icon size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: toast.sub ? 3 : 0 }}>
                {toast.message}
              </div>
              {toast.sub && (
                <div style={{ fontSize: 12, opacity: 0.85 }}>{toast.sub}</div>
              )}
            </div>
            <button
              onClick={() => onRemove(toast.id)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'white', opacity: 0.7, padding: 2, display: 'flex', flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function useToast() {
  const [toasts, setToasts] = useState([])
  const show = useCallback((message, type = 'success', sub = '', duration = 3500) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, sub }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])
  const remove = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), [])
  return { toasts, show, remove }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10)

const SKS_ITEM_CONFIG = {
  'Kids Clothes':    { icon: Shirt,           category: 'Clothing' },
  'Kids Shoes':      { icon: Footprints,      category: 'Clothing' },
  'Adult Clothes':   { icon: Shirt,           category: 'Clothing' },
  'Adult Shoes':     { icon: Footprints,      category: 'Clothing' },
  'Toys':            { icon: Gift,            category: 'Children' },
  'Sports Items':    { icon: Dumbbell,        category: 'Children' },
  'New Stationery':  { icon: BookOpen,        category: 'Education' },
  'Utensils':        { icon: UtensilsCrossed, category: 'Household' },
  'Furniture':       { icon: Armchair,        category: 'Household' },
  'TV':              { icon: Monitor,         category: 'Electronics' },
  'Laptop / PC':     { icon: Laptop,          category: 'Electronics' },
  'Purifier':        { icon: Wind,            category: 'Electronics' },
  'Microwave / OTG': { icon: Microwave,       category: 'Electronics' },
  'Others':          { icon: ShoppingBag,     category: 'Misc' },
}

function getDateRange(preset, customFrom, customTo) {
  const now = new Date()
  const fmt = d => d.toISOString().slice(0, 10)
  const y = now.getFullYear(), m = now.getMonth()
  if (preset === 'today') return { from: fmt(now), to: fmt(now) }
  if (preset === 'week') {
    const daysSinceMon = now.getDay() === 0 ? 6 : now.getDay() - 1
    const mon = new Date(now); mon.setDate(now.getDate() - daysSinceMon)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { from: fmt(mon), to: fmt(sun) }
  }
  if (preset === 'month') return { from: `${y}-${String(m + 1).padStart(2,'0')}-01`, to: fmt(now) }
  if (preset === 'last_month') {
    const lm = m === 0 ? 11 : m - 1; const ly = m === 0 ? y - 1 : y
    const last = new Date(ly, lm + 1, 0).getDate()
    return { from: `${ly}-${String(lm + 1).padStart(2,'0')}-01`, to: `${ly}-${String(lm + 1).padStart(2,'0')}-${String(last).padStart(2,'0')}` }
  }
  if (preset === 'custom') return { from: customFrom || '', to: customTo || '' }
  return { from: '', to: '' }
}

const DATE_PRESETS = [
  { id: '', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'custom', label: 'Custom' },
]

const PAY_METHODS = [
  { value: 'cash',   label: 'Cash',    icon: IndianRupee },
  { value: 'upi',    label: 'UPI',     icon: Smartphone },
  { value: 'bank',   label: 'Bank',    icon: CreditCard },
  { value: 'cheque', label: 'Cheque',  icon: FileTextIcon },
]

// ── Image viewer helper ───────────────────────────────────────────────────────
function openImageInTab(src, title = 'Payment Proof') {
  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;}</style></head><body><img src="${src}" style="max-width:100vw;max-height:100vh;object-fit:contain;"/></body></html>`)
  win.document.close()
}

// ── Payment Method Pills ──────────────────────────────────────────────────────
function PayMethodPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {PAY_METHODS.map(m => {
        const Icon = m.icon
        const active = value === m.value
        return (
          <button key={m.value} type="button" onClick={() => onChange(m.value)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 4, padding: '8px 4px', borderRadius: 9, cursor: 'pointer',
              border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
              background: active ? 'var(--primary-light)' : 'transparent',
              color: active ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: active ? 700 : 400, fontSize: 11.5,
              transition: 'all 0.12s',
            }}>
            <Icon size={14} />
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Screenshot thumbnail ──────────────────────────────────────────────────────
function ScreenshotThumb({ src, label = 'Payment Proof' }) {
  if (!src) return null
  return (
    <div
      onClick={() => openImageInTab(src, label)}
      title="Click to view full image"
      style={{
        cursor: 'pointer',
        width: 52, height: 52,
        borderRadius: 8,
        overflow: 'hidden',
        border: '2px solid var(--secondary)',
        flexShrink: 0,
        position: 'relative',
        background: 'var(--bg)',
      }}
    >
      <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0, transition: 'opacity 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0'}
      >
        <Eye size={16} color="white" />
      </div>
    </div>
  )
}

// ── Stock In Form ─────────────────────────────────────────────────────────────
function StockInForm({ allSKSItems, onAdd, onAddCustomItem, showToast }) {
  const { CITIES, CITY_SECTORS, locations, upsertLocation } = useApp()
  const [date,           setDate]           = useState(todayStr())
  const [city,           setCity]           = useState('Gurgaon')
  const [sector,         setSector]         = useState('')
  const [society,        setSociety]        = useState('')
  const [showNewSociety, setShowNewSociety] = useState(false)
  const [newSocietyVal,  setNewSocietyVal]  = useState('')
  const [itemQty,        setItemQty]        = useState({})
  const [newItemName,    setNewItemName]    = useState('')
  const [notes,          setNotes]          = useState('')
  const [error,          setError]          = useState('')
  const [submitting,     setSubmitting]     = useState(false)

  const sectorOptions  = CITY_SECTORS[city] || []
  const societyOptions = useMemo(() => {
    if (!city || !sector) return []
    return locations.sectorSocieties?.[`${city}::${sector}`] || []
  }, [city, sector, locations.sectorSocieties])

  const totalQty = Object.values(itemQty).reduce((s, v) => s + (Number(v) || 0), 0)
  const filledItems = Object.entries(itemQty).filter(([, q]) => (Number(q) || 0) > 0)

  const handleCityChange = (c) => { setCity(c); setSector(''); setSociety(''); setShowNewSociety(false) }
  const handleSectorChange = (s) => { setSector(s); setSociety(''); setShowNewSociety(false) }

  const handleSocietySelect = (v) => {
    if (v === '__add__') { setShowNewSociety(true); setSociety('') }
    else setSociety(v)
  }

  const confirmNewSociety = () => {
    const v = newSocietyVal.trim(); if (!v) return
    setSociety(v); setShowNewSociety(false); setNewSocietyVal('')
  }

  const handleAddCustomItem = () => {
    const name = newItemName.trim()
    if (!name) return
    if (allSKSItems.includes(name)) {
      showToast(`"${name}" already exists in the list`, 'info'); setNewItemName(''); return
    }
    onAddCustomItem(name)
    setNewItemName('')
    showToast(`Item type "${name}" added to the list`, 'success', 'You can now enter quantity below')
  }

  const handleSubmit = () => {
    setError('')
    if (!date)        { setError('Please select a date.'); return }
    if (!city)        { setError('Please select a city.'); return }
    if (totalQty < 1) { setError('Please enter quantity for at least one item.'); return }

    setSubmitting(true)
    const items = filledItems.map(([name, qty]) => ({ name, qty: Number(qty) }))

    setTimeout(() => {
      onAdd({
        date, city, sector,
        society: showNewSociety ? newSocietyVal.trim() : society,
        items, notes: notes.trim(),
      })
      showToast(
        'Items stored in warehouse successfully',
        'success',
        `${totalQty} item${totalQty !== 1 ? 's' : ''} across ${items.length} categor${items.length !== 1 ? 'ies' : 'y'} recorded`
      )
      setItemQty({}); setNotes('')
      setSubmitting(false)
    }, 350)
  }

  return (
    <div className="card">
      <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--secondary-light), var(--surface))' }}>
        <ArrowDownCircle size={18} color="var(--secondary)" />
        <div className="card-title" style={{ color: 'var(--secondary)' }}>Add Items in Stock</div>
        {totalQty > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--secondary)', background: 'var(--secondary-light)', padding: '3px 12px', borderRadius: 20, border: '1px solid rgba(27,94,53,0.2)' }}>
            {totalQty} items ready to save
          </span>
        )}
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Location */}
        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 14, border: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            <MapPin size={12} color="var(--primary)" /> Location Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Date <span className="required">*</span></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>City <span className="required">*</span></label>
              <input list="sks-cities" value={city} onChange={e => handleCityChange(e.target.value)} placeholder="Type or choose city" />
              <datalist id="sks-cities">
                {CITIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Sector / Area</label>
              <SectorSearchSelect
                options={sectorOptions}
                value={sector}
                onChange={handleSectorChange}
                disabled={!city}
                placeholder={city ? 'Search or select sector' : 'Select city first'}
                onAddOption={async (sectorName) => {
                  await upsertLocation({ city, sector: sectorName })
                  showToast('Sector added', 'success', `"${sectorName}" added under ${city}`)
                  return sectorName
                }}
                addLabel="Add sector"
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Society / Colony</label>
              {showNewSociety ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input autoFocus value={newSocietyVal} onChange={e => setNewSocietyVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmNewSociety()}
                    placeholder="Enter society name…" style={{ flex: 1 }} />
                  <button type="button" onClick={confirmNewSociety} className="btn btn-secondary btn-sm">✓</button>
                  <button type="button" onClick={() => { setShowNewSociety(false); setNewSocietyVal('') }} className="btn btn-ghost btn-sm"><X size={12} /></button>
                </div>
              ) : societyOptions.length > 0 ? (
                <select value={society} onChange={e => handleSocietySelect(e.target.value)}>
                  <option value="">— Select Society —</option>
                  {societyOptions.map(s => <option key={s}>{s}</option>)}
                  <option value="__add__">✏️ Add New Society…</option>
                </select>
              ) : (
                <input value={society} onChange={e => setSociety(e.target.value)}
                  placeholder={sector ? 'Type society name…' : 'Select sector first…'} />
              )}
            </div>
          </div>
          {(sector || society) && !showNewSociety && (
            <div style={{ marginTop: 10, padding: '6px 12px', background: 'var(--secondary-light)', borderRadius: 6, fontSize: 12, color: 'var(--secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={11} />
              {[society, sector, city].filter(Boolean).join(' › ')}
            </div>
          )}
        </div>

        {/* Items */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              SKS Items — Enter Quantities
            </div>
            {totalQty > 0 && (
              <span style={{ background: 'var(--secondary)', color: 'white', borderRadius: 20, fontSize: 11, padding: '2px 10px', fontWeight: 700 }}>
                {totalQty} items
              </span>
            )}
          </div>

          <div style={{ border: '1.5px solid var(--secondary)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', padding: '7px 14px', background: 'var(--secondary-light)', fontSize: 10.5, fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Item</span><span style={{ textAlign: 'right' }}>Qty</span>
            </div>
            {allSKSItems.map((item, idx) => {
              const cfg  = SKS_ITEM_CONFIG[item] || { icon: ShoppingBag, category: 'Custom' }
              const Icon = cfg.icon
              const qty  = Number(itemQty[item]) || 0
              return (
                <div key={item} style={{ display: 'grid', gridTemplateColumns: '1fr 110px', alignItems: 'center', padding: '9px 14px', borderTop: '1px solid var(--border-light)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--bg)', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Icon size={14} color={qty > 0 ? 'var(--secondary)' : 'var(--text-muted)'} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: qty > 0 ? 700 : 500, color: qty > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{item}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{cfg.category}</div>
                    </div>
                  </div>
                  <input type="number" onWheel={(e) => e.target.blur()} min={0} inputMode="numeric"
                    value={itemQty[item] || ''}
                    onChange={e => setItemQty(q => ({ ...q, [item]: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                    style={{ width: '100%', padding: '6px 10px', fontSize: 14, fontWeight: 700, textAlign: 'right', border: `1.5px solid ${qty > 0 ? 'var(--secondary)' : 'var(--border)'}`, borderRadius: 6 }}
                  />
                </div>
              )
            })}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', padding: '9px 14px', background: 'var(--secondary-light)', borderTop: '1.5px solid rgba(27,94,53,0.2)', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--secondary)' }}>Total Items</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: totalQty > 0 ? 'var(--secondary)' : 'var(--text-muted)' }}>
                {totalQty || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Add Custom Item */}
        <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px dashed var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={12} color="var(--secondary)" />
            Add New Item Type
            <span style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>Persists for future entries</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newItemName} onChange={e => setNewItemName(e.target.value)}
              placeholder="e.g. Blankets, School Bags, Winter Jackets…"
              onKeyDown={e => e.key === 'Enter' && handleAddCustomItem()}
              style={{ flex: 1, fontSize: 13 }} />
            <button type="button" onClick={handleAddCustomItem} className="btn btn-secondary btn-sm" disabled={!newItemName.trim()}>
              + Add
            </button>
          </div>
        </div>

        {/* Notes */}
        <div className="form-group" style={{ margin: 0 }}>
          <label>Notes <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>(optional)</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Donor name, drive details, remarks…" style={{ minHeight: 60, resize: 'vertical' }} />
        </div>

        {error && (
          <div className="alert-strip alert-danger" style={{ padding: '10px 14px', margin: 0 }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />{error}
          </div>
        )}

        {filledItems.length > 0 && (
          <div style={{ padding: '10px 14px', background: 'var(--secondary-light)', borderRadius: 8, border: '1px solid rgba(27,94,53,0.15)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--secondary)', marginBottom: 6 }}>Ready to save:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {filledItems.map(([name, qty]) => (
                <span key={name} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, background: 'var(--surface)', color: 'var(--secondary)', fontWeight: 600, border: '1px solid rgba(27,94,53,0.2)' }}>
                  {name} ×{qty}
                </span>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-secondary" onClick={handleSubmit} disabled={submitting || totalQty < 1}
          style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: 14, fontWeight: 700, background: 'var(--secondary)', color: 'white', opacity: totalQty < 1 ? 0.5 : 1 }}>
          {submitting
            ? <><span className="spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%' }} /> Saving…</>
            : <><ArrowDownCircle size={16} /> Record Stock In — {totalQty > 0 ? `${totalQty} items` : 'Enter quantities first'}</>}
        </button>
      </div>
    </div>
  )
}

// ── Stock In History ──────────────────────────────────────────────────────────
function HistoryView({ inflows, outflows = [], allSKSItems = [], isAdmin, onDeleteInflow, onDeleteOutflow, onUpdateInflow, onUpdateOutflow, showToast }) {
  const [datePreset, setDatePreset] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const [search,     setSearch]     = useState('')
  const [expanded,   setExpanded]   = useState({})
  const [editModal, setEditModal] = useState({ open: false, record: null })
  const [editForm, setEditForm] = useState({ date: todayStr(), notes: '', partnerName: '', partnerPhone: '', city: '', sector: '', society: '', items: [] })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const { from: dateFrom, to: dateTo } = useMemo(
    () => getDateRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo]
  )

  const movements = useMemo(() => ([
    ...inflows.map(r => ({ ...r, movementType: 'in', movementLabel: 'Stock In' })),
    ...outflows.map(r => ({ ...r, movementType: 'out', movementLabel: 'Stock Out' })),
  ]), [inflows, outflows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return movements.filter(r => {
      const inDate   = (!dateFrom || (r.date || '') >= dateFrom) && (!dateTo || (r.date || '') <= dateTo)
      const haystack = [
        r.movementLabel, r.society, r.sector, r.city, r.partnerName,
        r.partnerPhone, r.id, r.notes, ...(r.items || []).map(it => it.name),
      ].filter(Boolean).join(' ').toLowerCase()
      const inSearch = !q || haystack.includes(q)
      return inDate && inSearch
    }).sort((a, b) => {
      const byDate = (b.date || '').localeCompare(a.date || '')
      if (byDate) return byDate
      return (a.movementType || '').localeCompare(b.movementType || '')
    })
  }, [movements, dateFrom, dateTo, search])

  const totalInQty  = filtered.filter(r => r.movementType === 'in').reduce((s, r) => s + (r.items || []).reduce((a, it) => a + it.qty, 0), 0)
  const totalOutQty = filtered.filter(r => r.movementType === 'out').reduce((s, r) => s + (r.items || []).reduce((a, it) => a + it.qty, 0), 0)
  const toggleExpand = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const handleDelete = (record) => {
    const isOut = record.movementType === 'out'
    if (!window.confirm(`Delete this ${isOut ? 'Stock Out' : 'Stock In'} record?`)) return
    if (isOut) onDeleteOutflow(record.id)
    else onDeleteInflow(record.id)
    showToast(`${isOut ? 'Stock Out' : 'Stock In'} record deleted`, 'info')
  }

  const handleExport = () => {
    exportToExcel(
      filtered.flatMap(r => (r.items || []).map(it => ({
        'Movement': r.movementLabel, 'ID': r.id, 'Date': r.date,
        'Party / Location': r.movementType === 'out'
          ? [r.partnerName, r.partnerPhone].filter(Boolean).join(' / ')
          : [r.society, r.sector, r.city].filter(Boolean).join(', '),
        'Item': it.name, 'Qty': it.qty, 'Payment Status': r.payment?.status || '',
        'Notes': r.notes || '',
      }))),
      'SKS_Stock_Movement_History'
    )
    showToast('Export complete', 'success', `${filtered.length} records downloaded`)
  }

  const openEdit = (record) => {
    const isOut = record.movementType === 'out'
    setEditError('')
    setEditForm({
      date: record.date || todayStr(),
      notes: record.notes || '',
      partnerName: isOut ? (record.partnerName || '') : '',
      partnerPhone: isOut ? (record.partnerPhone || '') : '',
      city: !isOut ? (record.city || '') : '',
      sector: !isOut ? (record.sector || '') : '',
      society: !isOut ? (record.society || '') : '',
      items: (record.items || []).map(it => ({ name: it.name, qty: Number(it.qty) || 0 })),
    })
    setEditModal({ open: true, record })
  }

  const closeEdit = () => { setEditModal({ open: false, record: null }); setEditError(''); setEditSaving(false) }

  const normalizeEditItems = (items) => (items || [])
    .map(it => ({ name: String(it.name || '').trim(), qty: Number(it.qty) || 0 }))
    .filter(it => it.name && it.qty > 0)

  const saveEdit = async () => {
    const record = editModal.record
    if (!record?.id) return
    setEditError('')
    const items = normalizeEditItems(editForm.items)
    if (!editForm.date) { setEditError('Please select a date.'); return }
    if (items.length === 0) { setEditError('Please enter quantity for at least one item.'); return }
    if (record.movementType === 'out' && !editForm.partnerName.trim()) { setEditError('Recipient / Partner name is required for Stock Out.'); return }

    setEditSaving(true)
    try {
      const payload = record.movementType === 'out'
        ? {
          date: editForm.date,
          partnerName: editForm.partnerName.trim(),
          partnerPhone: editForm.partnerPhone.trim(),
          notes: editForm.notes.trim(),
          items,
        }
        : {
          date: editForm.date,
          city: editForm.city.trim(),
          sector: editForm.sector.trim(),
          society: editForm.society.trim(),
          notes: editForm.notes.trim(),
          items,
        }

      if (record.movementType === 'out') await onUpdateOutflow?.(record.id, payload)
      else await onUpdateInflow?.(record.id, payload)

      showToast('Record updated', 'success', `${record.movementLabel} ${record.id}`)
      closeEdit()
    } catch (err) {
      setEditError(err?.message || 'Update failed')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <Calendar size={13} color="var(--primary)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0 }}>Date:</span>
          {DATE_PRESETS.map(p => (
            <button key={p.id} className={`btn btn-sm ${datePreset === p.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 11.5 }} onClick={() => setDatePreset(p.id)}>
              {p.label}
            </button>
          ))}
          {datePreset === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ width: 140, fontSize: 12 }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ width: 140, fontSize: 12 }} />
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by society, sector, city, ID…"
            style={{ paddingLeft: 32, fontSize: 12.5, width: '100%' }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, fontSize: 12.5, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <span><strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> entries ·</span>
        <span><strong style={{ color: 'var(--secondary)' }}>+{totalInQty}</strong> stock in</span>
        <span><strong style={{ color: 'var(--primary)' }}>-{totalOutQty}</strong> stock out</span>
        {!isAdmin && (
          <span style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 10px', background: 'var(--border-light)', borderRadius: 20, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            🔒 Edit: Admin only
          </span>
        )}
        <button className="btn btn-ghost btn-sm" onClick={handleExport} style={{ marginLeft: isAdmin ? 'auto' : 0 }}>
          <Download size={12} /> Export
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" style={{ background: 'var(--secondary-light)', color: 'var(--secondary)' }}>
            <FileTextIcon size={24} />
          </div>
          <h3>No Stock Movement Records</h3>
          <p>Stock In and Stock Out entries will appear here once recorded.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(r => {
            const rowTotal   = (r.items || []).reduce((s, it) => s + it.qty, 0)
            const isOpen     = !!expanded[r.id]
            const isOut      = r.movementType === 'out'
            const tone       = isOut ? 'var(--primary)' : 'var(--secondary)'
            const toneBg     = isOut ? 'var(--primary-light)' : 'var(--secondary-light)'
            const IconMain   = isOut ? ArrowUpCircle : ArrowDownCircle
            const hasDetails = (r.items || []).length > 1 || !!r.notes || !!r.payment
            return (
              <div key={`${r.movementType}-${r.id}`} className="card">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px', cursor: hasDetails ? 'pointer' : 'default' }}
                  onClick={() => hasDetails && toggleExpand(r.id)}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: toneBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <IconMain size={18} color={tone} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: tone, background: toneBg, padding: '2px 8px', borderRadius: 20 }}>{r.movementLabel}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'white', background: tone, padding: '2px 7px', borderRadius: 4 }}>{r.id}</span>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{fmtDate(r.date)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: tone, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
                      {isOut ? <Package size={11} /> : <MapPin size={11} />}
                      {isOut && ([r.partnerName, r.partnerPhone].filter(Boolean).join(' / ') || 'Recipient not recorded')}
                      <span style={{ display: isOut ? 'none' : 'inline' }}>
                      {[r.society, r.sector, r.city].filter(Boolean).join(', ') || '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(r.items || []).slice(0, 4).map(it => (
                        <span key={it.name} style={{ fontSize: 10.5, padding: '2px 9px', borderRadius: 20, background: toneBg, color: tone, fontWeight: 600 }}>
                          {it.name} ×{it.qty}
                        </span>
                      ))}
                      {(r.items || []).length > 4 && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', padding: '2px 4px' }}>+{r.items.length - 4} more</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: tone, lineHeight: 1 }}>{isOut ? '-' : '+'}{rowTotal}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>items</div>
                    </div>
                    {hasDetails && <span style={{ color: 'var(--text-muted)' }}>{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>}
                    {isAdmin && (
                      <button onClick={e => { e.stopPropagation(); openEdit(r) }}
                        style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--info)', background: 'var(--info-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--info)' }}
                        title="Edit record (Admin only)">
                        <Edit2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border-light)', padding: '12px 16px', background: 'var(--bg)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                      {(r.items || []).map(it => {
                        const cfg = SKS_ITEM_CONFIG[it.name] || { icon: ShoppingBag }; const Icon = cfg.icon
                        return (
                          <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border-light)' }}>
                            <Icon size={13} color={tone} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 600 }} className="truncate">{it.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--secondary)', fontWeight: 700 }}>×{it.qty}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {isOut && r.payment && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--secondary)', background: 'var(--secondary-light)', padding: '3px 9px', borderRadius: 20 }}>
                          {fmtCurrency(Number(r.payment.amount) || 0)} received
                        </span>
                        {r.payment.status && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: tone, background: toneBg, padding: '3px 9px', borderRadius: 20 }}>
                            {r.payment.status}
                          </span>
                        )}
                        {r.payment.screenshot && <ScreenshotThumb src={r.payment.screenshot} label={`Payment Proof - ${r.partnerName}`} />}
                      </div>
                    )}
                    {r.notes && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 10px', background: 'var(--surface)', borderRadius: 6 }}>📝 {r.notes}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editModal.open && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closeEdit()}>
          <div className="modal" style={{ maxWidth: 720, width: '96vw' }}>
            <div className="modal-header">
              <div className="modal-title">Edit {editModal.record?.movementLabel}</div>
              <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 800, color: 'white', background: 'var(--info)', padding: '2px 10px', borderRadius: 6 }}>
                {editModal.record?.id}
              </span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={closeEdit}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              {editError && <div className="alert-strip alert-danger" style={{ marginBottom: 12 }}><AlertCircle size={14} /> {editError}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date <span className="required">*</span></label>
                  <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                {editModal.record?.movementType === 'out' ? (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Recipient / Partner Name <span className="required">*</span></label>
                    <input value={editForm.partnerName} onChange={e => setEditForm(f => ({ ...f, partnerName: e.target.value }))} />
                  </div>
                ) : (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>City</label>
                    <input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Gurgaon" />
                  </div>
                )}
              </div>

              {editModal.record?.movementType === 'out' ? (
                <div className="form-group" style={{ margin: '0 0 12px' }}>
                  <label>Contact Number</label>
                  <input value={editForm.partnerPhone} onChange={e => setEditForm(f => ({ ...f, partnerPhone: e.target.value }))} placeholder="10-digit" maxLength={10} inputMode="numeric" />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Sector / Area</label>
                    <input value={editForm.sector} onChange={e => setEditForm(f => ({ ...f, sector: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Society / Colony</label>
                    <input value={editForm.society} onChange={e => setEditForm(f => ({ ...f, society: e.target.value }))} />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Items <span className="required">*</span>
                </div>
                <div style={{ border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 36px', padding: '8px 12px', background: 'var(--surface-alt)', fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <span>Item</span>
                    <span style={{ textAlign: 'right' }}>Qty</span>
                    <span />
                  </div>
                  {(editForm.items || []).map((it, idx) => (
                    <div key={`${it.name}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 36px', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--border-light)', alignItems: 'center' }}>
                      <select value={it.name} onChange={e => setEditForm(f => ({ ...f, items: f.items.map((row, i) => i === idx ? { ...row, name: e.target.value } : row) }))}>
                        {allSKSItems.map(name => <option key={name} value={name}>{name}</option>)}
                      </select>
                      <input type="number" min={0} onWheel={e=>e.target.blur()} inputMode="numeric"
                        value={String(it.qty ?? '')}
                        onChange={e => setEditForm(f => ({ ...f, items: f.items.map((row, i) => i === idx ? { ...row, qty: parseInt(e.target.value) || 0 } : row) })) }
                        style={{ textAlign: 'right', fontWeight: 800 }}
                      />
                      <button type="button" className="btn btn-ghost btn-sm btn-icon"
                        onClick={() => setEditForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                        title="Remove">
                        <Trash2 size={14} color="var(--danger)" />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                  onClick={() => setEditForm(f => ({ ...f, items: [...(f.items || []), { name: allSKSItems[0] || 'Others', qty: 0 }] }))}>
                  <Plus size={14} /> Add item row
                </button>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Notes <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} style={{ minHeight: 70 }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeEdit} disabled={editSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Payment Section for Dispatch ──────────────────────────────────────────────
function DispatchPaymentSection({ payState, onChange }) {
  const { method, amount, reference, notes, screenshot } = payState

  const handleScreenshot = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    try {
      const uploaded = await uploadFileViaSignedUrl(file, {
        purpose: 'sks-proof',
        entityId: 'sks-dispatch',
      })
      onChange({ ...payState, screenshot: uploaded.url })
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(232,82,26,0.04), rgba(245,185,66,0.04))', borderRadius: 10, padding: 14, border: '1px solid rgba(232,82,26,0.18)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
        <IndianRupee size={12} /> Payment Received (Optional)
      </div>

      {/* Method */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 7 }}>Payment Method</label>
        <PayMethodPicker value={method} onChange={m => onChange({ ...payState, method: m, reference: '', screenshot: null })} />
      </div>

      {/* Amount */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 11.5 }}>Total Goods Value (₹)</label>
          <input type="number" onWheel={(e) => e.target.blur()} min={0} inputMode="decimal"
            value={payState.totalValue || ''}
            onChange={e => onChange({ ...payState, totalValue: e.target.value })}
            placeholder="Estimated value of goods" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 11.5 }}>Amount Received (₹)</label>
          <input type="number" onWheel={(e) => e.target.blur()} min={0} inputMode="decimal"
            value={amount}
            onChange={e => onChange({ ...payState, amount: e.target.value })}
            placeholder="0" />
        </div>
      </div>

      {/* Reference — non-cash only */}
      {method && method !== 'cash' && (
        <div className="form-group" style={{ margin: '0 0 12px' }}>
          <label style={{ fontSize: 11.5 }}>
            {method === 'upi' ? 'UPI Transaction ID' : method === 'bank' ? 'Bank Reference No.' : 'Cheque Number'}
            <span style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>(optional)</span>
          </label>
          <input value={reference} onChange={e => onChange({ ...payState, reference: e.target.value })} placeholder="Reference number…" />
        </div>
      )}

      {/* UPI Screenshot */}
      {method === 'upi' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <Image size={12} color="var(--info)" /> Payment Screenshot
            <span style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
          </label>
          {screenshot ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <ScreenshotThumb src={screenshot} label="Payment Proof" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--secondary)', marginBottom: 4 }}>Screenshot attached ✓</div>
                <button type="button" onClick={() => onChange({ ...payState, screenshot: null })}
                  style={{ fontSize: 11.5, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed', cursor: 'pointer', padding: '8px' }}>
              <Upload size={13} /> Upload UPI Screenshot
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleScreenshot} />
            </label>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="form-group" style={{ margin: 0 }}>
        <label style={{ fontSize: 11.5 }}>Payment Notes <span style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
        <input value={notes} onChange={e => onChange({ ...payState, notes: e.target.value })} placeholder="Any remarks about this payment…" />
      </div>

      {/* Payment summary preview */}
      {Number(amount) > 0 && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border-light)', display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, alignItems: 'center' }}>
          {(() => {
            const paid = Number(amount) || 0
            const total = Number(payState.totalValue) || 0
            const status = total === 0 ? 'Not Set' : paid >= total ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Not Paid'
            const colors = { 'Paid': 'var(--secondary)', 'Partially Paid': 'var(--warning)', 'Not Paid': 'var(--danger)', 'Not Set': 'var(--text-muted)' }
            return (
              <>
                <span style={{ fontWeight: 700, color: colors[status], fontSize: 12 }}>{status}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>·</span>
                <span style={{ color: 'var(--secondary)', fontWeight: 700 }}>₹{paid.toLocaleString('en-IN')} received</span>
                {total > 0 && paid < total && (
                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Due: ₹{Math.max(0, total - paid).toLocaleString('en-IN')}</span>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ── In Warehouse ──────────────────────────────────────────────────────────────
function WarehouseView({ stock, allSKSItems, showToast }) {
  const totalInStock   = Object.values(stock).reduce((s, v) => s + v, 0)

  const handleExportStock = () => {
    exportToExcel(
      allSKSItems.map(item => ({
        Item: item, Category: (SKS_ITEM_CONFIG[item] || {}).category || '—', 'In Stock': stock[item] || 0,
      })),
      'SKS_Warehouse_Stock'
    )
    showToast('Stock report exported', 'success')
  }

  return (
    <div>
      {/* KPIs */}
      <div 
  className="stat-grid" 
  style={{ 
    marginBottom: 10,
    display: "flex",
    justifyContent: "flex-start"
  }}
>
  <div 
    className="stat-card green"
    style={{
      width: "220px",
      maxWidth: "100%"
    }}
  >
    <div className="stat-icon"><Boxes size={18} /></div>
    <div className="stat-value">{totalInStock}</div>
    <div className="stat-label">Total In Warehouse</div>
    <div className="stat-change up">
      {allSKSItems.filter(i => (stock[i] || 0) > 0).length} item types
    </div>
  </div>
</div>

      {/* Low stock alert */}
      {allSKSItems.filter(i => (stock[i] || 0) > 0 && (stock[i] || 0) < 3).length > 0 && (
        <div className="alert-strip alert-warning" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>
            <strong>{allSKSItems.filter(i => (stock[i] || 0) > 0 && (stock[i] || 0) < 3).length} items</strong> running low (less than 3 in stock).
            {allSKSItems.filter(i => (stock[i] || 0) > 0 && (stock[i] || 0) < 3).slice(0, 3).map(i => ` ${i}`).join(',')}
          </span>
        </div>
      )}

      {/* Stock table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <Boxes size={16} color="var(--secondary)" />
          <div className="card-title">Current Stock</div>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={handleExportStock}>
            <Download size={13} /> Export
          </button>
        </div>
        <div className="table-wrap" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>In Stock</th>
              </tr>
            </thead>
            <tbody>
              {allSKSItems.map(item => {
                const cfg   = SKS_ITEM_CONFIG[item] || { icon: ShoppingBag, category: 'Custom' }
                const Icon  = cfg.icon
                const qty   = stock[item] || 0
                return (
                  <tr key={item} style={{ opacity: qty === 0 ? 0.4 : 1 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon size={14} color={qty > 0 ? 'var(--secondary)' : 'var(--text-muted)'} />
                        <span style={{ fontWeight: 600 }}>{item}</span>
                        {qty > 0 && qty < 3 && <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 20, background: 'var(--warning-bg)', color: '#92400E', fontWeight: 700 }}>Low</span>}
                      </div>
                    </td>
                    <td><span className="badge badge-muted" style={{ fontSize: 10 }}>{cfg.category}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: qty > 10 ? 'var(--secondary)' : qty > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                        {qty}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>



    </div>
  )
}

// ── Stock Out Tab ─────────────────────────────────────────────────────────────
function StockOutView({ stock, allSKSItems, onAddOutflow, showToast }) {
  const [partnerName,  setPartnerName]  = useState('')
  const [partnerPhone, setPartnerPhone] = useState('')
  const [dispDate,     setDispDate]     = useState(todayStr())
  const [dispQty,      setDispQty]      = useState({})
  const [dispNotes,    setDispNotes]    = useState('')
  const [dispError,    setDispError]    = useState('')
  const [dispatching,  setDispatching]  = useState(false)
  const [payState, setPayState] = useState({
    method: 'cash', amount: '', reference: '', notes: '', screenshot: null, totalValue: '',
  })

  const totalDispatch  = Object.values(dispQty).reduce((s, v) => s + (Number(v) || 0), 0)
  const filledDispatch = Object.entries(dispQty).filter(([, q]) => (Number(q) || 0) > 0)
  const canDispatch    = partnerName.trim() && dispDate && totalDispatch > 0
  const overDispatch   = filledDispatch.some(([name, qty]) => (Number(qty) || 0) > (stock[name] || 0))

  const handleDispatch = () => {
    setDispError('')
    if (!partnerName.trim()) { setDispError('Please enter a partner / recipient name.'); return }
    if (!dispDate)           { setDispError('Please select a dispatch date.'); return }
    if (totalDispatch < 1)   { setDispError('Please enter quantity for at least one item.'); return }
    if (overDispatch)        { setDispError('Some quantities exceed available stock. Please check.'); return }
    setDispatching(true)
    const items = filledDispatch.map(([name, qty]) => ({ name, qty: Number(qty) }))
    const paid = Number(payState.amount) || 0
    const total = Number(payState.totalValue) || 0
    setTimeout(() => {
      onAddOutflow({
        date: dispDate,
        partnerName: partnerName.trim(), partnerPhone: partnerPhone.trim(),
        items, notes: dispNotes.trim(),
        payment: { method: payState.method, amount: paid, totalValue: total, reference: payState.reference.trim(), notes: payState.notes.trim(), screenshot: payState.screenshot },
      })
      showToast('Items dispatched successfully', 'success',
        `${totalDispatch} item${totalDispatch !== 1 ? 's' : ''} sent to ${partnerName.trim()}${paid > 0 ? ` · ₹${paid.toLocaleString('en-IN')} received` : ''}`)
      setDispQty({}); setPartnerName(''); setPartnerPhone(''); setDispNotes(''); setDispError('')
      setPayState({ method: 'cash', amount: '', reference: '', notes: '', screenshot: null, totalValue: '' })
      setDispatching(false)
    }, 350)
  }

  return (
    <div>

      {/* Dispatch form */}
      <div className="card" style={{ marginBottom: 16, border: '2px solid var(--primary)' }}>
        <div className="card-header" style={{ background: 'var(--primary-light)' }}>
          <ArrowUpCircle size={16} color="var(--primary)" />
          <div className="card-title" style={{ color: 'var(--primary)' }}>Dispatch Items</div>
          {totalDispatch > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'rgba(232,82,26,0.1)', padding: '3px 12px', borderRadius: 20, border: '1px solid rgba(232,82,26,0.2)' }}>
              {totalDispatch} items ready
            </span>
          )}
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Recipient / Partner Name <span className="required">*</span></label>
              <input value={partnerName} onChange={e => setPartnerName(e.target.value)} placeholder="e.g. Teach for India" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Contact Number</label>
              <input value={partnerPhone} onChange={e => setPartnerPhone(e.target.value)} placeholder="10-digit" maxLength={10} inputMode="numeric" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Dispatch Date <span className="required">*</span></label>
              <input type="date" value={dispDate} onChange={e => setDispDate(e.target.value)} />
            </div>
          </div>

          {/* Item quantity table */}
          <div className="table-wrap" style={{ border: '1.5px solid var(--primary)', boxShadow: 'none', borderRadius: 10 }}>
            <table>
              <thead>
                <tr><th>Item</th><th>Category</th><th style={{ textAlign: 'right' }}>Available</th><th style={{ textAlign: 'right' }}>Dispatch Qty</th></tr>
              </thead>
              <tbody>
                {allSKSItems.map(item => {
                  const cfg = SKS_ITEM_CONFIG[item] || { icon: ShoppingBag, category: 'Custom' }
                  const Icon = cfg.icon
                  const qty = stock[item] || 0
                  const dQty = Number(dispQty[item]) || 0
                  const isOver = dQty > qty
                  return (
                    <tr key={item} style={{ opacity: qty === 0 ? 0.4 : 1 }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon size={14} color={qty > 0 ? 'var(--secondary)' : 'var(--text-muted)'} />
                          <span style={{ fontWeight: 600 }}>{item}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-muted" style={{ fontSize: 10 }}>{cfg.category}</span></td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, color: qty > 0 ? 'var(--secondary)' : 'var(--text-muted)' }}>{qty}</td>
                      <td style={{ textAlign: 'right' }}>
                        {qty > 0 ? (
                          <input type="number" onWheel={(e) => e.target.blur()} min={0} max={qty} inputMode="numeric"
                            value={dispQty[item] || ''} onChange={e => setDispQty(q => ({ ...q, [item]: parseInt(e.target.value) || 0 }))}
                            placeholder="0"
                            style={{ width: 82, padding: '5px 9px', fontSize: 13, fontWeight: 700, textAlign: 'right', border: `1.5px solid ${isOver ? 'var(--danger)' : dQty > 0 ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 6 }}
                          />
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Notes</label>
            <textarea value={dispNotes} onChange={e => setDispNotes(e.target.value)} placeholder="Purpose, receipt reference…" style={{ minHeight: 52 }} />
          </div>

          <DispatchPaymentSection payState={payState} onChange={setPayState} />

          {dispError && <div className="alert-strip alert-danger"><AlertCircle size={13} style={{ flexShrink: 0 }} /> {dispError}</div>}

          {filledDispatch.length > 0 && !overDispatch && (
            <div style={{ padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={14} />
              Dispatching: {filledDispatch.map(([n, q]) => `${n} ×${q}`).join(' · ')}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleDispatch} disabled={!canDispatch || dispatching || overDispatch}
            style={{ width: '100%', justifyContent: 'center', padding: '10px', opacity: (canDispatch && !overDispatch) ? 1 : 0.5 }}>
            {dispatching
              ? <><span className="spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%' }} /> Dispatching…</>
              : <><ArrowUpCircle size={15} /> Confirm Dispatch{Number(payState.amount) > 0 ? ` + Record ₹${Number(payState.amount).toLocaleString('en-IN')}` : ''}</>}
          </button>
        </div>
      </div>

      {/* Dispatch history */}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function SKSOverview() {
  const {
    sksInflows, sksOutflows,
    sksStock, SKS_ITEMS,
    addSksInflow, addSksOutflow,
    updateSksInflow, updateSksOutflow,
    deleteSksInflow, deleteSksOutflow,
  } = useApp()
  const { role } = useRole()
  const isAdmin  = role === 'admin'

  const [section,     setSection]     = useState('stockin')
  const [customItems, setCustomItems] = useState([])

  const { toasts, show: showToast, remove: removeToast } = useToast()

  const allSKSItems = useMemo(() => {
    const base = new Set(SKS_ITEMS)
    return [...SKS_ITEMS, ...customItems.filter(c => !base.has(c))]
  }, [customItems])

  const stock = useMemo(() => Object.fromEntries((sksStock || []).map(item => [item.name, item.qty])), [sksStock])

  const addInflow     = useCallback(async (r) => { await addSksInflow(r) }, [addSksInflow])
  const addOutflow    = useCallback(async (r) => { await addSksOutflow(r) }, [addSksOutflow])
  const deleteInflow  = useCallback(async (id) => { await deleteSksInflow(id) }, [deleteSksInflow])
  const deleteOutflow = useCallback(async (id) => { await deleteSksOutflow(id) }, [deleteSksOutflow])
  const patchInflow   = useCallback(async (id, patch) => { await updateSksInflow(id, patch) }, [updateSksInflow])
  const patchOutflow  = useCallback(async (id, patch) => { await updateSksOutflow(id, patch) }, [updateSksOutflow])
  const addCustomItem = useCallback(name => setCustomItems(prev => prev.includes(name) ? prev : [...prev, name]), [])

  const totalInStock    = Object.values(stock).reduce((s, v) => s + v, 0)
  const TABS = [
    { id: 'stockin',   label: '↓ Add Stock'},
    { id: 'history',   label: '📋 Stock History'},
    { id: 'warehouse', label: '📦 Warehouse Stock',count: totalInStock > 0 ? totalInStock : null },
    { id: 'stockout',  label: '↑ Sell Stock'},
  ]

  return (
    <div className="page-body">
      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 6px', background: 'var(--border-light)', borderRadius: 12, width: 'fit-content', marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setSection(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 9, border: 'none',
              cursor: 'pointer', fontSize: 13,
              fontWeight: section === tab.id ? 700 : 500,
              color: section === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              background: section === tab.id ? 'var(--surface)' : 'transparent',
              boxShadow: section === tab.id ? 'var(--shadow)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
            {tab.count !== null && (
              <span style={{ background: section === tab.id ? 'var(--secondary)' : 'var(--border)', color: section === tab.id ? 'white' : 'var(--text-muted)', borderRadius: 20, fontSize: 10.5, padding: '1px 7px', fontWeight: 700 }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {section === 'stockin' && (
        <StockInForm allSKSItems={allSKSItems} onAdd={addInflow} onAddCustomItem={addCustomItem} showToast={showToast} />
      )}
      {section === 'history' && (
        <HistoryView
          inflows={sksInflows}
          outflows={sksOutflows}
          allSKSItems={allSKSItems}
          isAdmin={isAdmin}
          onDeleteInflow={deleteInflow}
          onDeleteOutflow={deleteOutflow}
          onUpdateInflow={patchInflow}
          onUpdateOutflow={patchOutflow}
          showToast={showToast}
        />
      )}
      {section === 'warehouse' && (
        <WarehouseView
          stock={stock} allSKSItems={allSKSItems} showToast={showToast}
        />
      )}
      {section === 'stockout' && (
        <StockOutView
          stock={stock} allSKSItems={allSKSItems} onAddOutflow={addOutflow} showToast={showToast}
        />
      )}

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
} 
