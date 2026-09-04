import { useDomainData } from '../../../../hooks/useDomainData'

function sameCalendarDay(iso, dateISO, timeZone) {
  if (!iso || !dateISO) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const local = timeZone
    ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return local === dateISO
}

export function useEvents(projectId, dateISO, { includeDeleted = false } = {}) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_daily_activities', system: 'core', projectId, includeDeleted })
  const events = projectId && dateISO ? records.filter((e) => sameCalendarDay(e.start_date_time, dateISO, e.timezone)) : []
  return { events, loading, error, creating, updating, create, update, remove }
}
