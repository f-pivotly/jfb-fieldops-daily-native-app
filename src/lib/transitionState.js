import { normalizedCategory, TRANSITION_CATEGORY } from './operationalCategory'
import { compareActivitiesChrono, hasArea } from './eventAreaFill'

export function isTransition(activity) {
  return normalizedCategory(activity?.category).toUpperCase() === TRANSITION_CATEGORY
}

function groupByEquipmentDay(list) {
  const byDay = new Map()
  for (const a of list) {
    if (!a.equipment_id || !a.report_date) continue
    const key = `${a.equipment_id}|${a.report_date}`
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(a)
  }
  return byDay.values()
}

function effectiveActivity(a, current) {
  if (!current) return null
  if (hasArea(a)) {
    if (a.attachment_id || !current.attachment_id) return null
    return { ...a, attachment_id: current.attachment_id, inheritedFromTransitionId: current.id }
  }
  return {
    ...a,
    area: current.area ?? null,
    pass_type: current.pass_type ?? null,
    tsca: current.tsca ?? null,
    attachment_id: current.attachment_id ?? null,
    inheritedFromTransitionId: current.id,
  }
}

function resolveDay(rows, resolved) {
  let current = null
  for (const a of rows.slice().sort(compareActivitiesChrono)) {
    if (a.is_deleted) continue
    if (isTransition(a)) {
      current = a
      continue
    }
    const effective = effectiveActivity(a, current)
    if (effective) resolved.set(a.id, effective)
  }
}

export function withTransitionState(activities) {
  const list = activities ?? []
  const resolved = new Map()
  for (const rows of groupByEquipmentDay(list)) resolveDay(rows, resolved)
  return list.map((a) => resolved.get(a.id) ?? a)
}
