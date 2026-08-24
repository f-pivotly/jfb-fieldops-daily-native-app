import { useDomainData } from './useDomainData'

export function useMetricDefaults() {
  const { records, loading, error } =
    useDomainData({ domain: 'jfb_metric_defaults', system: 'core' })
  return { metricDefaults: records, loading, error }
}
