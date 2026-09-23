// Location helpers shared by the scheduler (setting a pickup pin) and the rider app.

/** Reads the device's GPS once. Resolves { lat, lng, accuracy, capturedAt }. */
export function getCurrentPosition({ timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device cannot share its location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
        capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
      }),
      err => reject(new Error(
        err.code === 1
          ? 'Location permission is blocked. Allow location for this site in the browser settings.'
          : 'Could not get your location. Move to an open spot and try again.'
      )),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    )
  })
}

/** Great-circle distance in metres (same formula as the server). */
export function distanceMeters(a, b) {
  if (!a || !b) return null
  const rad = deg => (deg * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)))
}

/**
 * Parses "28.61, 77.20" or a Google Maps link that carries coordinates
 * (…/@28.61,77.20,17z, …?q=28.61,77.20, …!3d28.61!4d77.20). Returns null if none found.
 */
export function parseCoordinates(text) {
  const value = String(text || '').trim()
  if (!value) return null
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/,
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (!match) continue
    const lat = Number(match[1])
    const lng = Number(match[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
  }
  return null
}

export function mapsLink(geo) {
  return geo ? `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lng}` : null
}

export function directionsLink(geo, address) {
  if (geo) return `https://www.google.com/maps/dir/?api=1&destination=${geo.lat},${geo.lng}`
  return address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : null
}

export function formatDistance(meters) {
  if (meters === null || meters === undefined) return '—'
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`
}
