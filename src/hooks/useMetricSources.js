import { useDomainData } from './useDomainData'

export function useMetricSources() {
  const { records, loading, error, reload } =
    useDomainData({ domain: 'jfb_metric_sources', system: 'core' })
  return { metricSources: records, loading, error, reload }
}
