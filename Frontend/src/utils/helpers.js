import { format, parseISO } from 'date-fns'

export const fmtDate = (d) => {
  if (!d) return '—'
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'dd MMM yyyy') }
  catch { return d }
}

export const fmtCurrency = (n) => {
  if (n === null || n === undefined) return '—'
  return `₹${Number(n).toLocaleString('en-IN')}`
}

export const donorStatusColor = (status) => ({
  Active: 'badge-success',
  'Pickup Due': 'badge-warning',
  'At Risk': 'badge-danger',
  Churned: 'badge-muted',
  Postponed: 'badge-warning',
  Lost: 'badge-danger',
}[status] || 'badge-muted')

export const pickupStatusColor = (status) => ({
  Completed: 'badge-success',
  Pending: 'badge-info',
  Postponed: 'badge-warning',
  'Did Not Open Door': 'badge-danger',
}[status] || 'badge-muted')

export const paymentStatusColor = (status) => ({
  Paid: 'badge-success',
  'Not Paid': 'badge-danger',
  'Partially Paid': 'badge-warning',
  'Write Off': 'badge-muted',
}[status] || 'badge-muted')

export const exportToExcel = (data, filename) => {
  import('xlsx').then(XLSX => {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, `${filename}.xlsx`)
  })
}

export const parseWATemplate = (template, donor, pickup) => {
  return template
    .replace(/{Donor Name}/g, donor?.name || '')
    .replace(/{Amount}/g, pickup?.totalValue || 0)
    .replace(/{Next Pickup Date}/g, fmtDate(pickup?.nextDate))
    .replace(/{Pickup Date}/g, fmtDate(pickup?.date))
    .replace(/{Days}/g, Math.round((pickup?.totalValue || 0) / 16))
}
