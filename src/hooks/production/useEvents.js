import { useDomainData } from '../core/useDomainData'
import { utcDayRange, sameCalendarDay } from '../../lib/reportDates'

export function useEvents(projectId, dateISO, { includeDeleted = false } = {}) {
  const range = dateISO ? utcDayRange(dateISO) : null
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({
      domain: 'jfb_daily_activities', system: 'core', projectId, includeDeleted,
      filters: range ? { start_date_time: { gte: range.gte, lt: range.lt } } : undefined,
    })
  const events = projectId && dateISO ? records.filter((e) => sameCalendarDay(e.start_date_time, dateISO, e.timezone)) : []
  return { events, loading, error, creating, updating, create, update, remove }
}
