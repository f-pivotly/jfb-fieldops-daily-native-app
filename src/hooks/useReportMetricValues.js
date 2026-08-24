import { useDomainData } from './useDomainData'

// No projectId filter -- jfb_report_metric_value has no project_id column of
// its own (only report_id/metric_id, matching jfb_production_stats' shape).
// Fetches broadly and lets callers filter client-side by metric_id, same
// idiom as useDelayCodes().
export function useReportMetricValues() {
  const { records, loading, error, create, update, remove, reload } =
    useDomainData({ domain: 'jfb_report_metric_value', system: 'core' })
  return { reportMetricValues: records, loading, error, create, update, remove, reload }
}
