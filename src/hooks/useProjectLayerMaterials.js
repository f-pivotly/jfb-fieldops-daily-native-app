import { useDomainData } from './useDomainData'

export function useProjectLayerMaterials(projectId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_project_layer_materials', system: 'core', projectId })
  return { layerMaterials: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
