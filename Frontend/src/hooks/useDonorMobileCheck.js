import { useEffect, useRef, useState } from 'react'
import { checkDonorByMobile } from '../services/api'

/**
 * Debounced hook: checks if a donor with the given mobile already exists.
 * Pass empty string to disable the check (e.g. when editing).
 *
 * Returns { status, existing, reset }
 *   status: 'idle' | 'checking' | 'found' | 'clear'
 */
export default function useDonorMobileCheck(mobile, debounceMs = 500) {
  const [status,   setStatus]   = useState('idle')
  const [existing, setExisting] = useState(null)
  const timerRef = useRef(null)

  const normalized = String(mobile || '').replace(/\D/g, '').slice(-10)

  useEffect(() => {
    if (normalized.length < 10) {
      setStatus('idle')
      setExisting(null)
      return
    }

    setStatus('checking')
    clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      try {
        const results = await checkDonorByMobile(normalized)
        const list = Array.isArray(results) ? results : []
        if (list.length > 0) {
          setStatus('found')
          setExisting(list[0])
        } else {
          setStatus('clear')
          setExisting(null)
        }
      } catch {
        setStatus('clear')
        setExisting(null)
      }
    }, debounceMs)

    return () => clearTimeout(timerRef.current)
  }, [normalized, debounceMs])

  const reset = () => { setStatus('idle'); setExisting(null) }

  return { status, existing, reset }
}