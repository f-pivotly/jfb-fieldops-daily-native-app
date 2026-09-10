import { makeListHook } from '../../../../hooks/domainHookFactory'

export const useHydraulicPipeConfigurations = makeListHook('jfb_hydraulic_pipe_configurations', 'pipeSegments', 'project')
