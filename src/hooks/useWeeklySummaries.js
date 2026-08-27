import { useDomainData } from './useDomainData'

export function useWeeklySummaries(projectId) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_weekly_summaries', system: 'core', projectId })
  return { summaries: records, loading, error, creating, updating, create, update, remove }
}
