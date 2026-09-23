import { useEffect, useRef, useState } from 'react'
import { sendRiderLocation } from '../services/api'
import { distanceMeters } from '../utils/geo'

const SEND_EVERY_MS = 30_000   // at most one update per 30 s…
const SEND_AFTER_METERS = 40   // …unless the rider has moved this far

/**
 * While `active` (the rider has an accepted pickup open), shares the phone's position
 * with the office. Browsers only report location while the app is open on screen.
 */
export default function useRiderLocationSharing(active) {
  const [state, setState] = useState({ sharing: false, lastSentAt: null, error: '' })
  const lastRef = useRef({ at: 0, position: null })

  useEffect(() => {
    if (!active || !('geolocation' in navigator)) return undefined
    const send = async (position) => {
      const last = lastRef.current
      const moved = last.position ? distanceMeters(last.position, position) : Infinity
      if (Date.now() - last.at < SEND_EVERY_MS && moved < SEND_AFTER_METERS) return
      lastRef.current = { at: Date.now(), position }
      try {
        const result = await sendRiderLocation(position)
        setState({ sharing: Boolean(result?.tracking), lastSentAt: new Date(), error: '' })
      } catch (err) {
        setState(s => ({ ...s, error: err.message || 'Could not send location' }))
      }
    }
    const id = navigator.geolocation.watchPosition(
      pos => send({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
        heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
        speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
      }),
      err => setState(s => ({ ...s, sharing: false, error: err.code === 1 ? 'Location permission is blocked' : '' })),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 60_000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [active])

  return active ? state : { sharing: false, lastSentAt: null, error: '' }
}
