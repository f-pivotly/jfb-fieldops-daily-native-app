const DREDGE_PROGRESS_WORK_TYPES = new Set(['Hydraulic Dredging', 'Mechanical Dredging'])

export function shouldShowDredgeProgress(project) {
  return DREDGE_PROGRESS_WORK_TYPES.has(project?.work_type)
}
