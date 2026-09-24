// Office map of riders with an accepted pickup: each rider's last position, the pins
// of their active pickups and a line between them. Also exports the polling hook.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { isStale, lastSeenText, riderColor } from '../utils/liveRiders'

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

function riderMarkerIcon(name, color, stale) {
  const initials = escapeHtml(String(name || 'R').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);position:absolute">
      <div style="width:34px;height:34px;border-radius:17px;background:${stale ? '#9ca3af' : color};color:#fff;font:700 12px/34px sans-serif;text-align:center;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${initials}</div>
      <div style="margin-top:2px;padding:1px 6px;border-radius:8px;background:#fff;font:600 11px sans-serif;color:#111;box-shadow:0 1px 3px rgba(0,0,0,.25);white-space:nowrap">${escapeHtml(name)}</div>
    </div>`,
    iconSize: [0, 0],
  })
}

function pickupMarkerIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);opacity:.9"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  })
}

export default function LiveRidersMap({ riders = [], height = 420, focusRiderId = null }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const fittedRef = useRef(false)

  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
      // OSM's tile policy requires a Referer; keep sending our origin even if the page policy changes.
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(map)
    map.setView([28.5355, 77.2], 10) // Delhi NCR until riders load
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => map.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const now = Date.now()
    const bounds = []

    riders.forEach((rider, index) => {
      const color = riderColor(index)
      const stale = isStale(rider, now)
      rider.trips.forEach(trip => {
        if (!trip.geo) return
        const popup = `<b>${escapeHtml(trip.donorName)}</b> · ${escapeHtml(trip.orderId)}<br>${escapeHtml(trip.address)}<br>${escapeHtml(rider.riderName)} · ${trip.stage === 'started' ? 'on the way' : 'accepted'}`
        L.marker([trip.geo.lat, trip.geo.lng], { icon: pickupMarkerIcon(color) }).bindPopup(popup).addTo(layer)
        bounds.push([trip.geo.lat, trip.geo.lng])
        if (rider.position && trip.stage === 'started') {
          L.polyline([[rider.position.lat, rider.position.lng], [trip.geo.lat, trip.geo.lng]], { color, weight: 2, dashArray: '5 7', opacity: stale ? 0.4 : 0.8 }).addTo(layer)
        }
      })
      if (rider.position) {
        const popup = `<b>${escapeHtml(rider.riderName)}</b><br>Last seen ${escapeHtml(lastSeenText(rider.lastSeenAt, now))} (±${rider.position.accuracy || '?'} m)<br>${rider.trips.map(t => `${escapeHtml(t.orderId)} – ${escapeHtml(t.donorName)} (${t.stage === 'started' ? 'on the way' : 'accepted'})`).join('<br>')}`
        L.marker([rider.position.lat, rider.position.lng], { icon: riderMarkerIcon(rider.riderName, color, stale), zIndexOffset: 1000 })
          .bindPopup(popup)
          .addTo(layer)
        bounds.push([rider.position.lat, rider.position.lng])
      }
    })

    const focus = focusRiderId && riders.find(r => r.riderId === focusRiderId)
    if (focus?.position) {
      map.setView([focus.position.lat, focus.position.lng], 16)
    } else if (!fittedRef.current && bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
      fittedRef.current = true
    }
  }, [riders, focusRiderId])

  return <div ref={containerRef} style={{ height, width: '100%', borderRadius: 10, overflow: 'hidden', zIndex: 0 }} />
}
