import { useDomainData } from './useDomainData'

export function useProjectMaterials(projectId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_project_materials', system: 'core', projectId })
  return { materials: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
