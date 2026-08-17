import { useDomainData } from './useDomainData'

export function useReports(projectId) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_reports', system: 'core' })
  const reports = projectId ? records.filter((r) => r.project_id === projectId) : records
  return { reports, loading, error, creating, updating, create, update, remove }
}
