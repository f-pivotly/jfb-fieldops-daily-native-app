import { useDomainData } from './useDomainData'

export function useProductionStats(reportId) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_production_stats', system: 'core' })
  const stats = reportId ? records.filter((s) => s.report_id === reportId) : records
  return { stats, loading, error, creating, updating, create, update, remove }
}
