import { useDomainData } from './useDomainData'

export function useProjectLayers(projectId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_project_layers', system: 'core', projectId })
  return { layers: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
