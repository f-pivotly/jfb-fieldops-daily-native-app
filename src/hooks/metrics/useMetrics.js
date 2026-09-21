import { makeListHook } from '../core/domainHookFactory'

export const useMetrics = makeListHook('jfb_metrics', 'metrics', 'project')
