import { makeListHook } from '../core/domainHookFactory'

export const useMetricSources = makeListHook('jfb_metric_sources', 'metricSources', null)
