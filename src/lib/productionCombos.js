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
    c.tsca === true ? 'y' : 'n',
    c.attachmentId ?? '',
  ].join('|')
}

function durationHours(startISO, endISO) {
  if (!startISO || !endISO) return 0
  const ms = new Date(endISO) - new Date(startISO)
  return ms > 0 ? ms / 3600000 : 0
}

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

  return [...combos.values()].sort((x, y) => {
    const xk = `${x.attachmentId ?? '~'}|${x.areaId ?? '~'}|${x.subAreaId ?? '~'}|${x.subSubAreaId ?? '~'}|${x.passKey ?? '~'}|${x.tsca}`
    const yk = `${y.attachmentId ?? '~'}|${y.areaId ?? '~'}|${y.subAreaId ?? '~'}|${y.subSubAreaId ?? '~'}|${y.passKey ?? '~'}|${y.tsca}`
    return xk.localeCompare(yk)
  })
}

export function comboNOH(combo) {
  return combo.contributing.filter((e) => !e.delay_code_id).reduce((sum, e) => sum + e.durationHours, 0)
}

export function isUnassigned(combo) {
  return combo.key === UNASSIGNED_KEY
}
