import { useDomainData } from './useDomainData'

export function useProjectSiteEquipment(projectId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_project_site_equipment', system: 'core', projectId })
  return { siteEquipment: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
