import { makeListHook } from '../core/domainHookFactory'

export const useWeeklySummaries = makeListHook('jfb_weekly_summaries', 'summaries', 'project')
