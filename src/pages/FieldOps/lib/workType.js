function dayOf(dateLike) {
  if (!dateLike) return null
  const s = String(dateLike).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

// Mirrors equipmentWorkType() in the non-native app's src/lib/projectPhase.ts:
// the equipment's own pinned work_type wins; a work_type_from cutover date
// means reports dated before it still fall through to the project's own
// work_type, so a mid-job discipline switch (one machine only) doesn't
// rewrite how its earlier reports render. No pin at all -> the project's
// work_type applies, same as every project today.
export function equipmentWorkType(project, equipment, reportDateISO) {
  const pinned = (equipment?.work_type || '').trim()
  if (!pinned) return (project?.work_type || '').trim()
  const from = dayOf(equipment?.work_type_from)
  if (from) {
    const day = dayOf(reportDateISO)
    if (day && day < from) return (project?.work_type || '').trim()
  }
  return pinned
}

// Mirrors the productive-tile category (activeCategory() in the operator app
// / dailyTrackingFormat.js's activeTileLabel()) -- the category persisted on
// a jfb_daily_activities row when no delay code is selected.
export function activeCategoryLabel(project, equipment, reportDateISO) {
  const wt = equipmentWorkType(project, equipment, reportDateISO).toLowerCase()
  return (wt.includes('cap') || wt.includes('placement')) ? 'ACTIVE PLACEMENT' : 'ACTIVE DREDGING'
}
