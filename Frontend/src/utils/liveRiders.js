// Shared by the office live-rider map and list.

const STALE_AFTER_MS = 5 * 60 * 1000

const COLORS = ['#2563eb', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777', '#4f46e5']

export function riderColor(index) {
  return COLORS[index % COLORS.length]
}

export function isStale(rider, now = Date.now()) {
  return !rider.lastSeenAt || now - new Date(rider.lastSeenAt).getTime() > STALE_AFTER_MS
}

export function lastSeenText(iso, now = Date.now()) {
  if (!iso) return 'no location yet'
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}
