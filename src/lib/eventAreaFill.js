
function hasArea(a) {
  const area = a?.area
  if (!area || typeof area !== 'object') return false
  return ['area_id', 'sub_area_id', 'sub_sub_area_id']
    .some((k) => typeof area[k] === 'string' && area[k].trim() !== '')
}

export function compareActivitiesChrono(a, b) {
  const at = Date.parse(a.start_date_time ?? '') || 0
  const bt = Date.parse(b.start_date_time ?? '') || 0
  if (at !== bt) return at - bt
  const ae = Date.parse(a.end_date_time ?? '') || 0
  const be = Date.parse(b.end_date_time ?? '') || 0
  if (ae !== be) return ae - be
  return String(a.id).localeCompare(String(b.id))
}

export function computeAreaFillTargets(activities, editedId) {
  const sorted = (activities ?? []).slice().sort(compareActivitiesChrono)
  const start = sorted.findIndex((a) => a.id === editedId)
  if (start < 0) return []
  const targets = []
  for (let i = start + 1; i < sorted.length; i++) {
    const a = sorted[i]
    if (a.is_deleted) continue
    if (hasArea(a) && a.area_source !== 'pe') break
    targets.push(a)
  }
  return targets
}
