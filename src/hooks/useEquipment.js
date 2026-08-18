import { useDomainData } from './useDomainData'

export function useEquipment(projectId) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_equipments', system: 'core', projectId })
  return { equipment: records, loading, error, creating, updating, create, update, remove }
}
