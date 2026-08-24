import { useDomainData } from './useDomainData'

export function useMetrics(projectId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_metrics', system: 'core', projectId })
  return { metrics: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
