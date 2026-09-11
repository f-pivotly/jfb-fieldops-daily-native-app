import { useDomainData } from '../../../../hooks/useDomainData'

export function useProductionStats(reportId) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_production_stats', system: 'core', reportId })
  return { stats: records, loading, error, creating, updating, create, update, remove }
}
