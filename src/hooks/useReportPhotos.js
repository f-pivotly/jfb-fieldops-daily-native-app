import { useDomainData } from './useDomainData'

// jfb_report_photos has no project-level server filter wired up here (mirrors
// useProductionStats.js) -- report_id is the real scope, matched client-side.
export function useReportPhotos(reportId) {
  const { records, loading, error, creating, updating, deleting, create, update, remove } =
    useDomainData({ domain: 'jfb_report_photos', system: 'core' })
  const photos = reportId ? records.filter((p) => p.report_id === reportId) : []
  return { photos, loading, error, creating, updating, deleting, create, update, remove }
}
