import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, MapPin, Phone, Search, UserRound } from 'lucide-react'

// ─── helpers ────────────────────────────────────────────────────────────────

function getDisplayValue(donor) {
  if (!donor) return ''
  return `${donor.name ?? ''} - ${donor.mobile ?? ''}`.trim()
}

// ─── DonorSearchSelect ───────────────────────────────────────────────────────
/**
 * Props:
 *  donors        — array of donor objects  (required)
 *  selectedDonor — currently selected donor object or null
 *  onSelect      — (donor | null) => void  called on selection / clear
 *  onAddNew      — () => void              optional "Add New Donor" callback
 */
export default function DonorSearchSelect({
  donors = [],
  selectedDonor = null,
  onSelect,
  onAddNew,
}) {
  const rootRef  = useRef(null)
  const listRef  = useRef(null)
  const inputRef = useRef(null)

  const [searchTerm,   setSearchTerm]   = useState(() => getDisplayValue(selectedDonor))
  const [isOpen,       setIsOpen]       = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState(-1)

  // ── Sync input when parent resets selectedDonor ──────────────────────────
  useEffect(() => {
    setSearchTerm(getDisplayValue(selectedDonor))
  }, [selectedDonor])

  // ── Outside-click handler — only attached while dropdown is open ──────────
  useEffect(() => {
    if (!isOpen) {
      setHoveredIndex(-1)
      return
    }

    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setIsOpen(false)
        setHoveredIndex(-1)
        // Restore the display value of the currently selected donor (or clear)
        setSearchTerm(getDisplayValue(selectedDonor))
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen, selectedDonor])

  // ── Filtered list (memo) ──────────────────────────────────────────────────
  const filteredDonors = useMemo(() => {
    const query         = searchTerm.trim().toLowerCase()
    const selectedLabel = getDisplayValue(selectedDonor).trim().toLowerCase()

    // Show full list when empty or when the search term exactly matches the
    // currently selected donor (i.e. the user hasn't started typing a new query)
    if (!query || (selectedLabel && query === selectedLabel)) return donors

    return donors.filter(donor =>
      String(donor.name   ?? '').toLowerCase().includes(query) ||
      String(donor.mobile ?? '').toLowerCase().includes(query)
    )
  }, [donors, searchTerm, selectedDonor])

  // ── Auto-scroll active item into view ────────────────────────────────────
  useEffect(() => {
    if (!isOpen || hoveredIndex < 0 || !listRef.current) return
    const node = listRef.current.querySelector(`[data-index="${hoveredIndex}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [hoveredIndex, isOpen])

  // ── Handlers ─────────────────────────────────────────────────────────────
  function selectDonor(donor) {
    onSelect?.(donor)
    setSearchTerm(getDisplayValue(donor))
    setIsOpen(false)
    setHoveredIndex(-1)
  }

  function handleInputChange(e) {
    const val = e.target.value
    setSearchTerm(val)
    setIsOpen(true)

    // Reset the parent's selected donor when the user starts typing freely
    if (selectedDonor) onSelect?.(null)

    // BUG FIX: use filteredDonors.length (computed next render).
    // We conservatively set 0 as the initial hover; the memo will recompute
    // right after the state update so the list will reflect the new query.
    setHoveredIndex(val.trim() ? 0 : -1)
  }

  function handleFocus() {
    setIsOpen(true)
    // BUG FIX: initialise hover to 0 (first visible item) only when list has items.
    // We use donors.length here as a proxy; filteredDonors isn't available synchronously
    // at focus time, but if there are no donors at all then -1 is correct.
    setHoveredIndex(donors.length > 0 ? 0 : -1)
  }

  function handleKeyDown(e) {
    // Open dropdown on ArrowDown or Enter when closed
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true)
      setHoveredIndex(filteredDonors.length > 0 ? 0 : -1)
      return
    }

    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHoveredIndex(curr => {
          if (!filteredDonors.length) return -1
          return curr >= filteredDonors.length - 1 ? 0 : curr + 1
        })
        break

      case 'ArrowUp':
        e.preventDefault()
        setHoveredIndex(curr => {
          if (!filteredDonors.length) return -1
          return curr <= 0 ? filteredDonors.length - 1 : curr - 1
        })
        break

      case 'Enter':
        e.preventDefault()
        if (hoveredIndex >= 0 && filteredDonors[hoveredIndex]) {
          selectDonor(filteredDonors[hoveredIndex])
        }
        break

      case 'Escape':
        setIsOpen(false)
        setHoveredIndex(-1)
        setSearchTerm(getDisplayValue(selectedDonor))
        inputRef.current?.blur()
        break

      default:
        break
    }
  }

  function handleToggle() {
    setIsOpen(prev => {
      const next = !prev
      if (next) {
        setHoveredIndex(filteredDonors.length > 0 ? 0 : -1)
        // Bring focus back to input so keyboard still works
        setTimeout(() => inputRef.current?.focus(), 0)
      } else {
        setHoveredIndex(-1)
        setSearchTerm(getDisplayValue(selectedDonor))
      }
      return next
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} className="relative">

      {/* ── Search input row ── */}
      <div
        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ transition: 'border-color 0.15s, box-shadow 0.15s' }}
        onFocusCapture={() => {}}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />

          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder="Search donor by name or mobile…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              // Override the global input styles so we get a bare input inside the wrapper
              flex: 1,
              border: 'none',
              background: 'transparent',
              padding: 0,
              margin: 0,
              fontSize: 13.5,
              fontWeight: 500,
              color: 'var(--text-primary)',
              outline: 'none',
              boxShadow: 'none',
              width: '100%',
            }}
          />

          {/* Chevron toggle */}
          <button
            type="button"
            onClick={handleToggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              borderRadius: '50%',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
            aria-label="Toggle donor list"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* ── Selected-donor info card (shown below input when closed) ── */}
        {selectedDonor && !isOpen && (
          <div style={{ borderTop: '1px solid var(--border-light)', padding: '10px 16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                background: 'var(--border-light)',
                borderRadius: 12,
                padding: '10px 12px',
              }}
            >
              <div
                style={{
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                  borderRadius: 10,
                  padding: 6,
                  flexShrink: 0,
                }}
              >
                <UserRound size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)', marginBottom: 3 }}>
                  {selectedDonor.name}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                  {(selectedDonor.society || selectedDonor.sector) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} />
                      {[selectedDonor.society, selectedDonor.sector].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {selectedDonor.mobile && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Phone size={12} />
                      {selectedDonor.mobile}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Dropdown list ── */}
      {isOpen && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: 'var(--shadow-md)',
            maxHeight: 280,
            overflowY: 'auto',
            padding: 8,
          }}
        >
          {filteredDonors.length > 0 ? (
            filteredDonors.map((donor, index) => {
              // BUG FIX: robust key — use id, fall back to mobile, then index
              const key       = donor.id ?? donor.mobile ?? String(index)
              const isActive  = index === hoveredIndex
              const isSelected = selectedDonor?.id === donor.id

              return (
                <button
                  key={key}
                  data-index={index}
                  type="button"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(-1)}
                  onClick={() => selectDonor(donor)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                    background: isActive
                      ? 'var(--primary-light)'
                      : isSelected
                        ? 'var(--surface-alt)'
                        : 'transparent',
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 13.5,
                      color: isActive ? 'var(--primary-dark)' : 'var(--text-primary)',
                    }}
                  >
                    {donor.name}
                    {isSelected && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--primary)', fontWeight: 500 }}>
                        ✓ selected
                      </span>
                    )}
                  </span>

                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 3,
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Phone size={11} />
                    {donor.mobile}
                  </span>

                  {(donor.society || donor.sector) && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        marginTop: 2,
                        fontSize: 11.5,
                        color: 'var(--text-muted)',
                      }}
                    >
                      <MapPin size={11} />
                      {[donor.society, donor.sector].filter(Boolean).join(', ')}
                    </span>
                  )}
                </button>
              )
            })
          ) : (
            /* ── Empty state ── */
            <div
              style={{
                padding: '20px 16px',
                borderRadius: 10,
                background: 'var(--surface-alt)',
                textAlign: 'center',
              }}
            >
              <p style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 4 }}>
                {donors.length === 0 ? 'No donors available' : 'No donors match your search'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {donors.length === 0
                  ? 'Add a donor first to get started.'
                  : `Try searching by name or mobile number.`}
              </p>

              {onAddNew && (
                <button
                  type="button"
                  onClick={onAddNew}
                  style={{
                    marginTop: 12,
                    padding: '7px 16px',
                    borderRadius: 8,
                    background: 'var(--primary)',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: 12.5,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  + Add New Donor
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
