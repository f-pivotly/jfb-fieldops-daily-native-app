import { useDomainData } from './useDomainData'

// jfb_production_week_breaks has many rows per project (one per shutdown period).
export function useProductionWeekBreaks(projectId) {
  const { records, loading, error, creating, deleting, reload, create, remove } =
    useDomainData({ domain: 'jfb_production_week_breaks', system: 'core', projectId })
  return { breaks: records, loading, error, creating, deleting, reload, create, remove }
}
