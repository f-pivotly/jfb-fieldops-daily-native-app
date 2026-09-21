import { makeListHook } from '../core/domainHookFactory'

export const useHydraulicPipeConfigurations = makeListHook('jfb_hydraulic_pipe_configurations', 'pipeSegments', 'project')
