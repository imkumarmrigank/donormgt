import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

function naturalCompare(a, b) {
  const ax = String(a || '').toLowerCase().match(/(\d+)|(\D+)/g) || []
  const bx = String(b || '').toLowerCase().match(/(\d+)|(\D+)/g) || []
  const len = Math.max(ax.length, bx.length)
  for (let i = 0; i < len; i++) {
    const x = ax[i]
    const y = bx[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = Number(x)
    const ny = Number(y)
    const xNum = Number.isFinite(nx) && String(nx) === x
    const yNum = Number.isFinite(ny) && String(ny) === y
    if (xNum && yNum) {
      if (nx !== ny) return nx - ny
    } else {
      if (x !== y) return x.localeCompare(y)
    }
  }
  return String(a || '').localeCompare(String(b || ''))
}

/**
 * SectorSearchSelect
 * Props:
 *  options     — array of sectors/areas (strings)
 *  value       — current value (string)
 *  onChange    — (value: string) => void
 *  disabled    — boolean
 *  placeholder — string
 */
export default function SectorSearchSelect({
  options = [],
  value = '',
  onChange,
  disabled = false,
  placeholder = 'Type or choose sector',
  onAddOption,
  addLabel = 'Add sector',
}) {
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  const [term, setTerm] = useState(value || '')
  const [isOpen, setIsOpen] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState(-1)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    setTerm(value || '')
  }, [value])

  useEffect(() => {
    if (!isOpen) {
      setHoveredIndex(-1)
      return
    }
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setIsOpen(false)
        setHoveredIndex(-1)
        setTerm(value || '')
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen, value])

  const sorted = useMemo(() => (
    [...new Set(options.filter(Boolean))].sort(naturalCompare)
  ), [options])

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(s => String(s).toLowerCase().includes(q))
  }, [sorted, term])

  const exactMatch = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return true
    return sorted.some(s => String(s).trim().toLowerCase() === q)
  }, [sorted, term])

  const canAdd = Boolean(onAddOption && term.trim() && !exactMatch)

  useEffect(() => {
    if (!isOpen || hoveredIndex < 0 || !listRef.current) return
    const node = listRef.current.querySelector(`[data-index="${hoveredIndex}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [hoveredIndex, isOpen])

  function selectOption(next) {
    onChange?.(next)
    setTerm(next)
    setIsOpen(false)
    setHoveredIndex(-1)
    setAddError('')
  }

  function handleInputChange(e) {
    const next = e.target.value
    setTerm(next)
    onChange?.(next) // allow custom areas too
    setIsOpen(true)
    setHoveredIndex(next.trim() ? 0 : -1)
    setAddError('')
  }

  function handleFocus() {
    if (disabled) return
    setIsOpen(true)
    setHoveredIndex(filtered.length > 0 ? 0 : -1)
  }

  function handleKeyDown(e) {
    if (disabled) return

    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true)
      setHoveredIndex(filtered.length > 0 ? 0 : -1)
      return
    }
    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHoveredIndex(curr => {
          if (!filtered.length) return -1
          return curr >= filtered.length - 1 ? 0 : curr + 1
        })
        break
      case 'ArrowUp':
        e.preventDefault()
        setHoveredIndex(curr => {
          if (!filtered.length) return -1
          return curr <= 0 ? filtered.length - 1 : curr - 1
        })
        break
      case 'Enter':
        e.preventDefault()
        if (hoveredIndex >= 0 && filtered[hoveredIndex]) {
          selectOption(filtered[hoveredIndex])
        } else {
          setIsOpen(false)
        }
        break
      case 'Escape':
        setIsOpen(false)
        setHoveredIndex(-1)
        setTerm(value || '')
        inputRef.current?.blur()
        break
      default:
        break
    }
  }

  async function handleAdd() {
    if (!canAdd || adding) return
    setAdding(true)
    setAddError('')
    try {
      const created = await onAddOption(term.trim())
      // If caller returns a canonical label, prefer it.
      if (typeof created === 'string' && created.trim()) {
        selectOption(created.trim())
      } else {
        selectOption(term.trim())
      }
    } catch (e) {
      setAddError(e?.message || 'Unable to add sector')
      setIsOpen(true)
    } finally {
      setAdding(false)
    }
  }

  function handleToggle() {
    if (disabled) return
    setIsOpen(prev => {
      const next = !prev
      if (next) {
        setHoveredIndex(filtered.length > 0 ? 0 : -1)
        setTimeout(() => inputRef.current?.focus(), 0)
      } else {
        setHoveredIndex(-1)
        setTerm(value || '')
        setAddError('')
      }
      return next
    })
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: disabled ? 'var(--border-light)' : 'var(--surface)',
          boxShadow: 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Search size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={term}
            disabled={disabled}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              padding: 0,
              margin: 0,
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-primary)',
              outline: 'none',
              boxShadow: 'none',
              width: '100%',
              opacity: disabled ? 0.6 : 1,
              cursor: disabled ? 'not-allowed' : 'text',
            }}
          />
          <button
            type="button"
            onClick={handleToggle}
            disabled={disabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              borderRadius: '50%',
              background: 'transparent',
              border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted)',
              transition: 'background 0.15s',
              flexShrink: 0,
              opacity: disabled ? 0.5 : 1,
            }}
            aria-label="Toggle sector list"
          >
            <ChevronDown
              size={16}
              style={{
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
              }}
            />
          </button>
      </div>

      {isOpen && !disabled && (
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
            maxHeight: 260,
            overflowY: 'auto',
            padding: 6,
          }}
        >
          {filtered.length > 0 ? (
            filtered.map((s, idx) => {
              const isActive = idx === hoveredIndex
              const isSelected = (value || '') === s
              return (
                <button
                  key={`${s}-${idx}`}
                  data-index={idx}
                  type="button"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(-1)}
                  onClick={() => selectOption(s)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 10px',
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
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: isActive ? 'var(--primary-dark)' : 'var(--text-primary)' }}>
                    {s}
                  </span>
                  {isSelected && <span style={{ fontSize: 11.5, color: 'var(--primary)', fontWeight: 700 }}>✓</span>}
                </button>
              )
            })
          ) : (
            <div style={{ padding: '14px 12px', borderRadius: 10, background: 'var(--surface-alt)', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)' }}>
                No sectors match “{term.trim()}”
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                Press Enter to keep as a custom area.
              </div>
            </div>
          )}

          {canAdd && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-light)' }}>
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 10px',
                  borderRadius: 10,
                  border: '1px dashed var(--primary)',
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                  cursor: adding ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  fontSize: 13,
                  opacity: adding ? 0.7 : 1,
                }}
              >
                {adding ? 'Adding…' : `+ ${addLabel}: "${term.trim()}"`}
              </button>
              {addError && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--danger)', fontWeight: 600 }}>
                  {addError}
                </div>
              )}
              {!addError && (
                <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Adds this sector to Firebase so everyone can use it.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

