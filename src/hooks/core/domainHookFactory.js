import { useDomainData } from './useDomainData'

const SCOPE_PARAM = { project: 'projectId', report: 'reportId' }

export function makeListHook(domain, key, scope, transform) {
  function useGeneratedListHook(scopeId) {
    const scopeParam = scope ? { [SCOPE_PARAM[scope]]: scopeId } : {}
    const { records, ...rest } = useDomainData({ domain, system: 'core', ...scopeParam })
    return { [key]: transform ? transform(records) : records, ...rest }
  }
  return useGeneratedListHook
}

export function makeRowHook(domain, key, scope) {
  function useGeneratedRowHook(scopeId) {
    const { records, ...rest } = useDomainData({ domain, system: 'core', [SCOPE_PARAM[scope]]: scopeId })
    return { [key]: records[0] ?? null, ...rest }
  }
  return useGeneratedRowHook
}
