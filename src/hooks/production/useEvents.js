import { useDomainData } from '../core/useDomainData'

export function useEvents(projectId, dateISO, { includeDeleted = false } = {}) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({
      domain: 'jfb_daily_activities', system: 'core', projectId, includeDeleted,
      filters: dateISO ? { report_date: dateISO } : undefined,
    })
  const events = projectId && dateISO ? records : []
  return { events, loading, error, creating, updating, create, update, remove }
}
