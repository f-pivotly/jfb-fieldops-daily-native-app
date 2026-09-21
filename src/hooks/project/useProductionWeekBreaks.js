import { useDomainData } from '../core/useDomainData'

export function useProductionWeekBreaks(projectId) {
  const { records, loading, error, creating, deleting, reload, create, remove } =
    useDomainData({ domain: 'jfb_production_week_breaks', system: 'core', projectId })
  return { breaks: records, loading, error, creating, deleting, reload, create, remove }
}
