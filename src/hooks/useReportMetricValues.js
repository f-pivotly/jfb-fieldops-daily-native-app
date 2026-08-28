import { useDomainData } from './useDomainData'

export function useReportMetricValues() {
  const { records, loading, error, create, update, remove, reload } =
    useDomainData({ domain: 'jfb_report_metric_value', system: 'core' })
  return { reportMetricValues: records, loading, error, create, update, remove, reload }
}
