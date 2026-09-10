import { makeListHook } from './domainHookFactory'

export const useMetricSources = makeListHook('jfb_metric_sources', 'metricSources', null)
