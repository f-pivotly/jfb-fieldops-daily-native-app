import { useDomainData } from './useDomainData'

export function useProjectDelayCodes(projectId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_project_delay_codes', system: 'core', projectId })
  return { projectDelayCodes: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
