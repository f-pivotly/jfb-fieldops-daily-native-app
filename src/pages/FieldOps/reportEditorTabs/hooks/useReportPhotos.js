import { useDomainData } from '../../../../hooks/useDomainData'

export function useReportPhotos(reportId) {
  const { records, loading, error, creating, updating, deleting, create, update, remove } =
    useDomainData({ domain: 'jfb_report_photos', system: 'core', reportId })
  return { photos: records, loading, error, creating, updating, deleting, create, update, remove }
}
