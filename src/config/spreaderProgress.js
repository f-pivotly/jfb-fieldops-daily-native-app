import { equipmentWorkType } from '../pages/FieldOps/lib/workType'

function isSpreaderUnit(project, equipment, reportDateISO) {
  const wt = equipmentWorkType(project, equipment, reportDateISO).toLowerCase()
  return wt.includes('cap') || wt.includes('placement')
}

export function shouldShowSpreaderProgress(project, equipment, reportDateISO) {
  return project?.is_spreader_active === true && isSpreaderUnit(project, equipment, reportDateISO)
}
