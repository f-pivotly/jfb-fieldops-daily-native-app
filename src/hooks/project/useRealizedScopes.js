import { makeListHook } from '../core/domainHookFactory'

export const useRealizedScopes = makeListHook('jfb_realized_scopes', 'scopes', 'project')
