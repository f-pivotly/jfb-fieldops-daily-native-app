import { useDomainData } from './useDomainData'

export function useProjectMaterialComponents(projectId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_project_material_components', system: 'core', projectId })
  return { materialComponents: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
