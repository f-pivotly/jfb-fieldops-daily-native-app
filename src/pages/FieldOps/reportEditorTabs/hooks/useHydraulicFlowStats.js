import { useDomainData } from '../../../../hooks/useDomainData'

export function useHydraulicFlowStats(projectId) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_hydraulic_flow_stats', system: 'core', projectId })
  return { flowStats: records, loading, error, creating, updating, create, update, remove }
}
