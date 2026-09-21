import { equipmentWorkType } from '../pages/FieldOps/lib/workType'

const DREDGE_PROGRESS_WORK_TYPES = new Set(['Hydraulic Dredging', 'Mechanical Dredging'])

export function projectShowsDredgeChart(project) {
  return project?.show_dredge_chart === true
}

export function shouldShowDredgeProgress(project, equipment, reportDateISO) {
  return projectShowsDredgeChart(project) && DREDGE_PROGRESS_WORK_TYPES.has(equipmentWorkType(project, equipment, reportDateISO))
}
