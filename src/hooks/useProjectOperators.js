import { useDomainData } from './useDomainData'

export function useProjectOperators(projectId) {
  const { records, loading, error, creating, updating, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_project_operators', system: 'core', projectId })
  return { projectOperators: records, loading, error, creating, updating, reload, create, update, remove }
}
