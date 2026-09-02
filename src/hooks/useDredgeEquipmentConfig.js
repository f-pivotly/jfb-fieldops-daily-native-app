import { useDomainData } from './useDomainData'

export function useDredgeEquipmentConfig(projectId) {
  const { records, loading, error, creating, updating, deleting, create, update, remove } =
    useDomainData({ domain: 'jfb_dredge_equipment_config', system: 'core', projectId })
  return { equipmentConfigs: records, loading, error, creating, updating, deleting, create, update, remove }
}
