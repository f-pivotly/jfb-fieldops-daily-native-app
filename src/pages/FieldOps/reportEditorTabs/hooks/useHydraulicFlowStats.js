import { makeListHook } from '../../../../hooks/domainHookFactory'

export const useHydraulicFlowStats = makeListHook('jfb_hydraulic_flow_stats', 'flowStats', 'project')
