import { useDomainData } from './useDomainData'

export function useWeeklySummaryPhotos(projectId) {
  const { records, loading, error, creating, updating, deleting, create, update, remove } =
    useDomainData({ domain: 'jfb_weekly_summary_photos', system: 'core', projectId })
  return { photos: records, loading, error, creating, updating, deleting, create, update, remove }
}
