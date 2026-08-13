import { useDomainData } from './useDomainData'


export function useProjectAreas(projectId) {
  const { records, loading, error, creating, updating, deleting, create, update, remove } =
    useDomainData({ domain: 'jfb_project_areas', system: 'core' })
  const areas = projectId ? records.filter((a) => a.project_id === projectId) : records
  return { areas, loading, error, creating, updating, deleting, create, update, remove }
}
