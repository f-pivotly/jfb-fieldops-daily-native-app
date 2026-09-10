import { equipmentWorkType } from '../pages/FieldOps/lib/workType'

const DREDGE_PROGRESS_WORK_TYPES = new Set(['Hydraulic Dredging', 'Mechanical Dredging'])

export function shouldShowDredgeProgress(project, equipment, reportDateISO) {
  return DREDGE_PROGRESS_WORK_TYPES.has(equipmentWorkType(project, equipment, reportDateISO))
}
