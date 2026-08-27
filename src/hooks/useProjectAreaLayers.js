import { useDomainData } from './useDomainData'

export function useProjectAreaLayers(projectId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_project_area_layers', system: 'core', projectId })
  return { areaLayers: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
