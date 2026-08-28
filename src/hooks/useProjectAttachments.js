import { useDomainData } from './useDomainData'

export function useProjectAttachments(projectId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_project_attachments', system: 'core', projectId })
  return { attachments: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
