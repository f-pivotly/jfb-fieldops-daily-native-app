import { useDomainData } from './useDomainData'

// jfb_daily_activities has no event-date field, so a day's events are found
// by matching project_id + the calendar day of start_date_time.
//
// The calendar day is computed in the EVENT's own timezone (its `timezone`
// field, e.g. "Asia/Manila"), not the viewing browser's local timezone --
// otherwise a UTC instant that's mid-afternoon in the project's timezone can
// land on the previous/next calendar day for a viewer elsewhere, silently
// dropping real events from the day they actually belong to. Falls back to
// UTC (not browser-local) when a record has no timezone set, since UTC is
// at least the same for every viewer.
function sameCalendarDay(iso, dateISO, timeZone) {
  if (!iso || !dateISO) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const local = timeZone
    ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return local === dateISO
}

export function useEvents(projectId, dateISO) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_daily_activities', system: 'core', projectId })
  // project_id is already filtered server-side; the calendar-day match still
  // has to happen client-side -- there's no confirmed server-side range
  // filter to narrow "one day" any further than "one project".
  const events = projectId && dateISO ? records.filter((e) => sameCalendarDay(e.start_date_time, dateISO, e.timezone)) : []
  return { events, loading, error, creating, updating, create, update, remove }
}
