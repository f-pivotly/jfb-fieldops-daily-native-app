import { reportTimeZone } from './reportTz'

export function sameCalendarDay(iso, dateISO, timeZone) {
  if (!iso || !dateISO) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const local = timeZone
    ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return local === dateISO
}

export function utcDayRange(dateISO) {
  const start = new Date(`${dateISO}T00:00:00.000Z`)
  const gte = new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const lt = new Date(start.getTime() + 48 * 60 * 60 * 1000).toISOString()
  return { gte, lt }
}

export function hhmm(iso, timeZone = reportTimeZone()) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) })
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function dayOfWeek(dateISO, long = false) {
  if (!dateISO) return ''
  const [y, m, d] = String(dateISO).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return (long ? WEEKDAY_LONG : WEEKDAY)[new Date(y, m - 1, d).getDay()]
}

export function todayISO() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function prettyDate(dateISO) {
  if (!dateISO) return ''
  const [y, m, d] = String(dateISO).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function zoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = {}
  for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') parts[p.type] = p.value
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second)
  return asUTC - date.getTime()
}

export function hhmm24(iso, timeZone = reportTimeZone()) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, ...(timeZone ? { timeZone } : {}),
  })
}

export function wallTimeToUtcISO(dateISO, hhmmText, timeZone = reportTimeZone()) {
  if (!dateISO || !hhmmText) return null
  if (!timeZone) return new Date(`${dateISO}T${hhmmText}:00`).toISOString()
  const naive = new Date(`${dateISO}T${hhmmText}:00Z`)
  if (Number.isNaN(naive.getTime())) return null
  const first = new Date(naive.getTime() - zoneOffsetMs(naive, timeZone))
  return new Date(naive.getTime() - zoneOffsetMs(first, timeZone)).toISOString()
}
