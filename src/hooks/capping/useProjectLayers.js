import { makeListHook } from '../core/domainHookFactory'

export const useProjectLayers = makeListHook('jfb_project_layers', 'layers', 'project')
