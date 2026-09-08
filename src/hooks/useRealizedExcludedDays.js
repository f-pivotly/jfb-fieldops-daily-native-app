import { useDomainData } from './useDomainData'

// jfb_realized_excluded_days has many rows per project (one per excluded date).
export function useRealizedExcludedDays(projectId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_realized_excluded_days', system: 'core', projectId })
  return { excludedDays: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
