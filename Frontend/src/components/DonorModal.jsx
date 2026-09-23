import { useRef, useState, useEffect } from 'react'
import { X, User, MapPin, Loader } from 'lucide-react'
import { useApp } from '../context/AppContext'
import SocietyInput from './SocietyInput'
import SectorSearchSelect from './SectorSearchSelect'
import useDonorMobileCheck from '../hooks/useDonorMobileCheck'
import DonorDuplicateAlert from './DonorDuplicateAlert'

const EMPTY = {
  name: '', mobile: '', city: 'Gurgaon', sector: '', society: '', address: '',
}

export default function DonorModal({ onClose, onAdd }) {
  const { CITIES, CITY_SECTORS, upsertLocation } = useApp()
  const [form,   setForm]   = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  // ── Debounced duplicate check ─────────────────────────────────────────────
  const mobileCheck = useDonorMobileCheck(form.mobile)

  const sectors = CITY_SECTORS[form.city] || []

  const setField = (key, val) => {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'city')   { next.sector = ''; next.society = '' }
      if (key === 'sector') { next.society = '' }
      return next
    })
    setErrors(e => ({ ...e, [key]: '' }))
  }

  // ── Use existing donor ────────────────────────────────────────────────────
  const handleUseExisting = () => {
    onAdd(mobileCheck.existing)
    onClose()
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim())
      e.name = 'Name is required'
    if (!form.mobile.trim() || form.mobile.replace(/\D/g, '').length < 10)
      e.mobile = 'Valid 10-digit mobile required'
    if (!form.city)
      e.city = 'City is required'
    return e
  }

const handleSubmit = async () => {
    // Handle existing donor automatically
    if (mobileCheck.status === 'found' && mobileCheck.existing) {
      handleUseExisting()
      return
    }

    // Create new donor (no duplicate found)
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    
    // Clean payload: omit empty optionals to fix backend validation
    const cleanData = {
      name: form.name.trim(),
      mobile: form.mobile.replace(/\D/g, '').slice(-10),
      donorType: 'donor',
      ...(form.city.trim() && { city: form.city.trim() }),
      ...(form.sector?.trim() && { sector: form.sector.trim() }),
      ...(form.society?.trim() && { society: form.society.trim() }),
      ...(form.address.trim() && { house: form.address.trim() })
    }
    
    setSaving(true)
    try {
      await onAdd(cleanData)
      onClose() // Auto-close on success
    } catch (error) {
      console.error('Donor creation failed:', error)
      setErrors({ general: `Failed to add donor: ${error.message || 'Unknown error'}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560, width: '95vw' }}>

        {/* Header */}
        <div className="modal-header">
          <User size={18} color="var(--primary)" />
          <div className="modal-title">Add New Donor</div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">

          {/* ── Duplicate alert ── */}
          {mobileCheck.status === 'found' && mobileCheck.existing && (
            <DonorDuplicateAlert
              donor={mobileCheck.existing}
              onUseExisting={handleUseExisting}
              onDismiss={mobileCheck.reset}
            />
          )}

          <div className="form-grid">
            {/* Name */}
            <div className="form-group">
              <label>Full Name <span className="required">*</span></label>
              <input
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                placeholder="e.g. Anjali Sharma"
                autoFocus
              />
              {errors.name && (
                <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>
                  {errors.name}
                </div>
              )}
            </div>

            {/* Mobile with live status indicator */}
            <div className="form-group">
              <label>Mobile Number <span className="required">*</span></label>
              <div style={{ position: 'relative' }}>
                <input
                  value={form.mobile}
                  onChange={e => setField('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                  maxLength={10}
                  style={{ paddingRight: 36 }}
                />
                {/* Status indicator */}
                {mobileCheck.status === 'checking' && (
                  <Loader size={14} style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)', color: 'var(--text-muted)',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                )}
                {mobileCheck.status === 'clear' && (
                  <span style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)', fontSize: 14, color: 'var(--secondary)',
                  }}>✓</span>
                )}
                {mobileCheck.status === 'found' && (
                  <span style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)', fontSize: 14, color: 'var(--warning)',
                  }}>⚠</span>
                )}
              </div>
              {errors.mobile && (
                <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>
                  {errors.mobile}
                </div>
              )}
            </div>

            {/* City */}
            <div className="form-group">
              <label>City <span className="required">*</span></label>
              <input
                list="donor-modal-cities"
                value={form.city}
                onChange={e => setField('city', e.target.value)}
                placeholder="Type or choose city"
              />
              <datalist id="donor-modal-cities">
                {CITIES.map(c => <option key={c} value={c} />)}
              </datalist>
              {errors.city && (
                <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}>
                  {errors.city}
                </div>
              )}
            </div>

            {/* Sector */}
            <div className="form-group">
              <label>Sector / Area</label>
              <SectorSearchSelect
                options={sectors}
                value={form.sector}
                onChange={val => setField('sector', val)}
                disabled={!form.city}
                placeholder={form.city ? 'Search or select sector' : 'Select city first'}
                onAddOption={async sectorName => {
                  await upsertLocation({ city: form.city, sector: sectorName })
                  return sectorName
                }}
                addLabel="Add sector"
              />
            </div>

            {/* Society */}
            <div className="form-group full">
              <label>Society / Colony</label>
              <SocietyInput
                city={form.city}
                sector={form.sector}
                value={form.society}
                onChange={val => setField('society', val)}
                id="donor-modal"
              />
            </div>

            {/* Address */}
            <div className="form-group">
              <label>
                House / Flat No.{' '}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                  (optional)
                </span>
              </label>
              <input
                value={form.address}
                onChange={e => setField('address', e.target.value)}
                placeholder="e.g. A-101, Flat 3B"
              />
            </div>
          </div>

          {/* Location preview & errors */}
          {(form.sector || form.society) && (
            <div style={{
              marginTop: 14, padding: '10px 14px',
              background: 'var(--secondary-light)', borderRadius: 8,
              fontSize: 12.5, color: 'var(--secondary)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <MapPin size={13} />
              {[form.society, form.sector, form.city].filter(Boolean).join(', ')}
            </div>
          )}
          
          {errors.general && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: 'var(--danger-bg)', borderRadius: 8, border: '1px solid var(--danger)',
              fontSize: 12.5, color: 'var(--danger)',
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              <span style={{ fontSize: 11 }}>⚠</span>
              {errors.general}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={
                saving ||
                !form.name.trim() ||
                !form.mobile.trim() ||
                mobileCheck.status === 'checking' ||
                (mobileCheck.status === 'found' && mobileCheck.existing)
              }
            >
              {saving ? (
                <>
                  <span className="spin" style={{
                    display: 'inline-block', width: 14, height: 14,
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: 'white', borderRadius: '50%',
                  }} />
                  {mobileCheck.status === 'found' && mobileCheck.existing ? 'Using existing…' : 'Adding…'}
                </>
              ) : mobileCheck.status === 'found' && mobileCheck.existing ? (
                'Using Existing Donor'
              ) : (
                '+ Add New Donor'
              )}
            </button>
        </div>
      </div>
    </div>
  )
}