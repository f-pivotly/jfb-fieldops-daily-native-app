import { equipmentWorkType } from '../pages/FieldOps/lib/workType'

export function isPlacementEquipment(project, equipment, reportDateISO) {
  const wt = equipmentWorkType(project, equipment, reportDateISO).toLowerCase()
  return wt.includes('cap') || wt.includes('placement')
}

export function shouldShowPlacementProgress(project, equipment, reportDateISO, config) {
  return isPlacementEquipment(project, equipment, reportDateISO) && !!config && config.active !== false
}
