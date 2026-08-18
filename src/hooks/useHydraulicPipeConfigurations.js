import { useDomainData } from './useDomainData'

export function useHydraulicPipeConfigurations(projectId) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_hydraulic_pipe_configurations', system: 'core', projectId })
  return { pipeSegments: records, loading, error, creating, updating, create, update, remove }
}
