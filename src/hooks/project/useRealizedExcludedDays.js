import { makeListHook } from '../core/domainHookFactory'

export const useRealizedExcludedDays = makeListHook('jfb_realized_excluded_days', 'excludedDays', 'project')
