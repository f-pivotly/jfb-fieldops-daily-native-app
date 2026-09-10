import { makeListHook } from './domainHookFactory'

export const useMetrics = makeListHook('jfb_metrics', 'metrics', 'project')
