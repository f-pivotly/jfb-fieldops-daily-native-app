import { useDomainData } from './useDomainData'

export function useProject(projectId) {
  const { records, loading, error } = useDomainData({ domain: 'projects', system: 'core' })
  const project = records.find((p) => p.id === projectId) ?? null
  return { project, loading, error }
}
