// Full-screen trip map for a rider: live position, pickup pin, road route and the
// distance left. "Mark pickup" becomes the main action once within range.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ArrowLeft, CheckCircle2, LocateFixed, Navigation } from 'lucide-react'
import { directionsLink, distanceMeters, formatDistance } from '../utils/geo'

const ROUTE_REFRESH_METERS = 150 // re-route after the rider moves this far
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

const riderIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,.35),0 2px 6px rgba(0,0,0,.3)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const pickupIcon = L.divIcon({
  className: '',
  html: '<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:#E8521A;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
})

async function fetchRoute(from, to) {
  const url = `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  const response = await fetch(url)
  if (!response.ok) throw new Error('route unavailable')
  const data = await response.json()
  const route = data.routes?.[0]
  if (!route) throw new Error('no route')
  return {
    points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distance: Math.round(route.distance),
    duration: Math.round(route.duration),
  }
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return ''
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
}

export default function RiderMap({ pickup, maxDistance, onClose, onMark }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const riderMarkerRef = useRef(null)
  const accuracyRef = useRef(null)
  const routeLineRef = useRef(null)
  const routedFromRef = useRef(null)
  const followRef = useRef(true)

  const [position, setPosition] = useState(null)
  const [route, setRoute] = useState(null)
  const [gpsError, setGpsError] = useState('')

  const target = pickup.geo
  const address = [pickup.house || pickup.houseNo, pickup.society, pickup.sector, pickup.city].filter(Boolean).join(', ')

  // Map setup
  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
      // OSM's tile policy requires a Referer; keep sending our origin even if the page policy changes.
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    if (target) {
      L.marker([target.lat, target.lng], { icon: pickupIcon }).addTo(map).bindPopup(pickup.donorName || 'Pickup')
      L.circle([target.lat, target.lng], { radius: maxDistance, color: '#E8521A', weight: 1, fillOpacity: 0.08 }).addTo(map)
      map.setView([target.lat, target.lng], 16)
    } else {
      map.setView([28.6139, 77.209], 11)
    }
    map.on('dragstart', () => { followRef.current = false })
    mapRef.current = map
    return () => map.remove()
  }, [target, pickup.donorName, maxDistance])

  // Live GPS
  const gpsSupported = 'geolocation' in navigator
  useEffect(() => {
    if (!gpsSupported) return undefined
    const id = navigator.geolocation.watchPosition(
      pos => {
        setGpsError('')
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) })
      },
      err => setGpsError(err.code === 1
        ? 'Location permission is blocked. Allow location for this site to see your route.'
        : 'Waiting for GPS…'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [gpsSupported])

  // Rider marker + first fit
  useEffect(() => {
    const map = mapRef.current
    if (!map || !position) return
    const latLng = [position.lat, position.lng]
    if (!riderMarkerRef.current) {
      riderMarkerRef.current = L.marker(latLng, { icon: riderIcon, zIndexOffset: 1000 }).addTo(map)
      accuracyRef.current = L.circle(latLng, { radius: position.accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.1 }).addTo(map)
      if (target) map.fitBounds(L.latLngBounds([latLng, [target.lat, target.lng]]), { padding: [60, 60], maxZoom: 17 })
      else map.setView(latLng, 16)
    } else {
      riderMarkerRef.current.setLatLng(latLng)
      accuracyRef.current.setLatLng(latLng).setRadius(position.accuracy)
      if (followRef.current && !target) map.panTo(latLng)
    }
  }, [position, target])

  // Road route, refreshed when the rider has moved on. Only the newest request may
  // draw; GPS updates in between must not cancel it.
  const routeRequestRef = useRef(0)
  useEffect(() => {
    if (!position || !target) return
    const last = routedFromRef.current
    if (last && distanceMeters(last, position) < ROUTE_REFRESH_METERS) return
    routedFromRef.current = position
    const requestId = ++routeRequestRef.current
    const from = position
    const draw = (points, style) => {
      if (requestId !== routeRequestRef.current || !mapRef.current) return false
      if (routeLineRef.current) routeLineRef.current.remove()
      routeLineRef.current = L.polyline(points, style).addTo(mapRef.current)
      return true
    }
    fetchRoute(from, target)
      .then(result => {
        if (draw(result.points, { color: '#2563eb', weight: 5, opacity: 0.8 })) setRoute(result)
      })
      .catch(() => {
        // Routing service down: fall back to a straight guide line.
        if (draw([[from.lat, from.lng], [target.lat, target.lng]], { color: '#2563eb', weight: 3, dashArray: '6 8' })) setRoute(null)
      })
  }, [position, target])

  useEffect(() => () => { routeRequestRef.current += 1 }, [])

  const recenter = () => {
    followRef.current = true
    const map = mapRef.current
    if (!map) return
    if (position && target) map.fitBounds(L.latLngBounds([[position.lat, position.lng], [target.lat, target.lng]]), { padding: [60, 60], maxZoom: 17 })
    else if (position) map.setView([position.lat, position.lng], 16)
  }

  const gpsMessage = gpsSupported ? gpsError : 'This device cannot share its location.'
  const straight = position && target ? distanceMeters(position, target) : null
  const arrived = straight !== null && straight <= maxDistance
  const navLink = directionsLink(target, address)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} title="Back"><ArrowLeft size={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pickup.donorName}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{address}</div>
        </div>
        {navLink && (
          <a className="btn btn-outline btn-sm" href={navLink} target="_blank" rel="noreferrer"><Navigation size={14} /> Google Maps</a>
        )}
      </div>

      <div style={{ position: 'relative', flex: 1 }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        <button onClick={recenter} title="Recenter"
          style={{ position: 'absolute', right: 10, top: 10, zIndex: 500, width: 40, height: 40, borderRadius: 20, border: 'none', background: '#fff', boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <LocateFixed size={18} color="#2563eb" />
        </button>
        {!target && (
          <div className="alert-strip alert-warning" style={{ position: 'absolute', left: 10, right: 60, top: 10, zIndex: 500, fontSize: 12.5 }}>
            This pickup has no map pin. Use Google Maps with the address; the visit will be flagged for the office.
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px calc(12px + env(safe-area-inset-bottom))', background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          {gpsMessage && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{gpsMessage}</span>}
          {!gpsMessage && !position && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Finding your location…</span>}
          {position && target && (arrived
            ? <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--secondary)', display: 'inline-flex', gap: 6, alignItems: 'center' }}><CheckCircle2 size={17} /> You have reached the pickup ({formatDistance(straight)})</span>
            : <>
                <span style={{ fontSize: 20, fontWeight: 800 }}>{formatDistance(route?.distance ?? straight)}</span>
                {route && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>about {formatDuration(route.duration)} by road</span>}
                {!route && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>straight-line distance</span>}
              </>
          )}
          {position && <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>GPS ±{position.accuracy} m</span>}
        </div>
        <button className={`btn ${arrived || !target ? 'btn-primary' : 'btn-outline'}`} style={{ justifyContent: 'center', padding: 12, fontSize: 15 }} onClick={onMark}>
          <CheckCircle2 size={17} /> {arrived || !target ? 'Mark pickup' : `Mark pickup (must be within ${maxDistance} m)`}
        </button>
      </div>
    </div>
  )
}
