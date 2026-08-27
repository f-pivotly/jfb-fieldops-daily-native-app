import { useDomainData } from './useDomainData'

export function useProjectComponents(projectId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_project_components', system: 'core', projectId })
  return { components: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
