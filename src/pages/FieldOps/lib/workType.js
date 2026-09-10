function dayOf(dateLike) {
  if (!dateLike) return null
  const s = String(dateLike).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function effectiveWorkType(project, reportDateISO) {
  const current = (project?.work_type || '').trim()
  const cutover = dayOf(project?.placement_start_date)
  const prior = (project?.prior_work_type || '').trim()
  if (!cutover || !prior) return current
  const day = dayOf(reportDateISO)
  if (!day) return current
  return day < cutover ? prior : current
}

export function equipmentWorkType(project, equipment, reportDateISO) {
  const pinned = (equipment?.work_type || '').trim()
  if (!pinned) return effectiveWorkType(project, reportDateISO)
  const from = dayOf(equipment?.work_type_from)
  if (from) {
    const day = dayOf(reportDateISO)
    if (day && day < from) return effectiveWorkType(project, reportDateISO)
  }
  return pinned
}

export function activeCategoryLabel(project, equipment, reportDateISO) {
  const wt = equipmentWorkType(project, equipment, reportDateISO).toLowerCase()
  return (wt.includes('cap') || wt.includes('placement')) ? 'ACTIVE PLACEMENT' : 'ACTIVE DREDGING'
}

const PRODUCTIVE_CATEGORIES = new Set(['ACTIVE DREDGING', 'ACTIVE PLACEMENT'])

export function isProductiveActivity(a) {
  if (a.category && PRODUCTIVE_CATEGORIES.has(a.category)) return true
  return !a.category && !a.delay_code_id
}
