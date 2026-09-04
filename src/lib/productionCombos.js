// Port of the reference app's src/lib/productionCombos.ts. One real
// difference: no TRANSITION-event handling. Reference needs it because an
// operator event can arrive with no area of its own, inheriting whichever
// combo a PE's last transition marker set. Native's events always carry
// their own area (jfb_daily_activities.area, possibly null) -- there's no
// marker-event concept and none of the apps that write activities ever
// leave area-inheritance to a "current combo" tracker. So every activity
// either has its own area (attribute directly) or it doesn't (Unassigned).
// See DREDGE_FEATURE_GAPS.md.
//
// The other real difference: reference keys combos on denormalized label
// TEXT (area_l1 etc.) because that's all it has. Native has real ids
// (area_id/sub_area_id/sub_sub_area_id, attachment_id) -- keying on those
// instead avoids the rename-ambiguity problem label-text keys can't avoid.

const UNASSIGNED_KEY = '__unassigned'

export function comboKey(c) {
  if (!c.areaId && !c.subAreaId && !c.subSubAreaId && !c.passKey && c.tsca == null && !c.attachmentId) {
    return UNASSIGNED_KEY
  }
  return [
    c.areaId ?? '',
    c.subAreaId ?? '',
    c.subSubAreaId ?? '',
    c.passKey ?? '',
    // TSCA is a flag: unspecified (null) and false are the same "not
    // flagged" bucket for keying a row -- only true is distinct. Same
    // reasoning as reference (KZ 8/6 Pilot Channel: a null-tsca chart pull
    // and a false-tsca manual entry doubled Area Covered before this rule).
    c.tsca === true ? 'y' : 'n',
    c.attachmentId ?? '',
  ].join('|')
}

function durationHours(startISO, endISO) {
  if (!startISO || !endISO) return 0
  const ms = new Date(endISO) - new Date(startISO)
  return ms > 0 ? ms / 3600000 : 0
}

/**
 * Walk the day's activities and group them into combos by (area, pass/layer,
 * tsca, attachment). `passKeyOf(activity)` picks which field is this
 * combo's "pass" dimension -- pass_type for dredging rows, layer_id for
 * capping rows (the two disciplines that overload one column in reference,
 * kept as separate native columns).
 */
export function buildCombosFromActivities(activities, { passKeyOf }) {
  const combos = new Map()
  for (const a of activities) {
    const area = a.area ?? {}
    const c = {
      areaId: area.area_id ?? null,
      subAreaId: area.sub_area_id ?? null,
      subSubAreaId: area.sub_sub_area_id ?? null,
      passKey: passKeyOf(a) ?? null,
      tsca: a.tsca ?? null,
      attachmentId: a.attachment_id ?? null,
    }
    const key = comboKey(c)
    let row = combos.get(key)
    if (!row) {
      row = { key, ...c, timeHours: 0, contributing: [] }
      combos.set(key, row)
    }
    const hours = durationHours(a.start_date_time, a.end_date_time)
    row.timeHours += hours
    row.contributing.push({ id: a.id, delay_code_id: a.delay_code_id ?? null, durationHours: hours })
  }

  // Stable display order: attachment first (groups same-attachment rows),
  // then area, then pass, then tsca -- same as reference.
  return [...combos.values()].sort((x, y) => {
    const xk = `${x.attachmentId ?? '~'}|${x.areaId ?? '~'}|${x.subAreaId ?? '~'}|${x.subSubAreaId ?? '~'}|${x.passKey ?? '~'}|${x.tsca}`
    const yk = `${y.attachmentId ?? '~'}|${y.areaId ?? '~'}|${y.subAreaId ?? '~'}|${y.subSubAreaId ?? '~'}|${y.passKey ?? '~'}|${y.tsca}`
    return xk.localeCompare(yk)
  })
}

// NOH criterion: no delay code attached -- the same criterion
// dvw-jfb-noh.json's own SQL already uses (`delay_code_id IS NULL`),
// simpler than reference's isOperationalCategory (native has no
// delay_category concept; delay_code_id null/non-null is the whole split).
export function comboNOH(combo) {
  return combo.contributing.filter((e) => !e.delay_code_id).reduce((sum, e) => sum + e.durationHours, 0)
}

export function isUnassigned(combo) {
  return combo.key === UNASSIGNED_KEY
}
