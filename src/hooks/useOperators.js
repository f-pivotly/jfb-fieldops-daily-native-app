import { useDomainData } from './useDomainData'

export function useOperators(projectId) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_operators', system: 'core', projectId })
  return { operators: records, loading, error, creating, updating, create, update, remove }
}
