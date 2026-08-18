import { useDomainData } from './useDomainData'


export function useProjectAreas(projectId) {
  const { records, loading, error, creating, updating, deleting, create, update, remove } =
    useDomainData({ domain: 'jfb_project_areas', system: 'core', projectId })
  return { areas: records, loading, error, creating, updating, deleting, create, update, remove }
}
