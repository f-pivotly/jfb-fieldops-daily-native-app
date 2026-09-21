import { useRef, useState } from 'react'
import { readWrittenRecordId } from '../../data'
import { buildCombosFromActivities, comboNOH, comboKey, isUnassigned } from '../../lib/productionCombos'
import { computeAvgFace, num } from '../../lib/productionValues'

function comboKeyOfPersisted(p) {
  const combo = Array.isArray(p.area_level_combinations) ? p.area_level_combinations : []
  return comboKey({
    areaId: combo[0]?.area_id ?? null,
    subAreaId: combo[1]?.area_id ?? null,
    subSubAreaId: combo[2]?.area_id ?? null,
    passKey: p.pass_value ?? null,
    tsca: p.tsca ?? null,
    attachmentId: p.attachment_id ?? null,
  })
}

export function useComboProduction({
  report,
  selectedEquipmentId,
  activities,
  rows,
  areasById,
  attachmentsById,
  passTypeLabels,
  create,
  update,
}) {
  const [comboEdits, setComboEdits] = useState({})
  const inFlightByKey = useRef(new Map())

  const combos = buildCombosFromActivities(activities ?? [], { passKeyOf: (a) => a.pass_type }).map((c) => ({
    ...c,
    areaLabel: areasById.get(c.areaId)?.name ?? null,
    subAreaLabel: areasById.get(c.subAreaId)?.name ?? null,
    subSubAreaLabel: areasById.get(c.subSubAreaId)?.name ?? null,
    passLabel: c.passKey ? (passTypeLabels?.[c.passKey] ?? c.passKey) : null,
    attachmentLabel: c.attachmentId ? (attachmentsById.get(c.attachmentId)?.name ?? null) : null,
  }))
  const persistedByKey = new Map(rows.map((p) => [comboKeyOfPersisted(p), p]))

  async function persistCombo(combo, patch) {
    const previous = inFlightByKey.current.get(combo.key)
    const chain = (async () => {
      let existingId = previous
        ? await previous.then((r) => r.id).catch(() => persistedByKey.get(combo.key)?.id ?? null)
        : (persistedByKey.get(combo.key)?.id ?? null)
      if (existingId) {
        await update(existingId, patch)
        return { id: existingId }
      }
      const areaLevelCombinations = [combo.areaId, combo.subAreaId, combo.subSubAreaId]
        .filter(Boolean)
        .map((id) => ({ area_level_id: areasById.get(id)?.area_level_id ?? null, area_id: id, label: areasById.get(id)?.name ?? null }))
      const created = await create({
        report_id: report.id,
        equipment_id: selectedEquipmentId,
        area_level_combinations: areaLevelCombinations,
        pass_value: combo.passKey,
        tsca: combo.tsca,
        attachment_id: combo.attachmentId,
        ...patch,
      })
      return { id: readWrittenRecordId(created) }
    })()
    inFlightByKey.current.set(combo.key, chain)
    try {
      return await chain
    } finally {
      if (inFlightByKey.current.get(combo.key) === chain) inFlightByKey.current.delete(combo.key)
    }
  }

  function comboCellValue(combo, field) {
    const editKey = `${combo.key}:${field}`
    if (editKey in comboEdits) return comboEdits[editKey]
    const existing = persistedByKey.get(combo.key)
    return existing?.[field] ?? ''
  }

  function setComboCellValue(combo, field, value) {
    setComboEdits((prev) => ({ ...prev, [`${combo.key}:${field}`]: value }))
  }

  async function commitComboCell(combo, field, digits) {
    const editKey = `${combo.key}:${field}`
    if (!(editKey in comboEdits)) return
    const value = digits != null ? num(comboEdits[editKey], digits) : (comboEdits[editKey].trim() || null)
    setComboEdits((prev) => {
      const next = { ...prev }
      delete next[editKey]
      return next
    })
    const existing = persistedByKey.get(combo.key)
    if (value === (existing?.[field] ?? null)) return
    await persistCombo(combo, { [field]: value })
  }

  const unassignedCombo = combos.find((c) => isUnassigned(c)) ?? null

  const comboTotals = combos.reduce(
    (acc, c) => {
      const values = { volume: comboCellValue(c, 'volume'), area: comboCellValue(c, 'area') }
      acc.goh += c.timeHours
      acc.noh += comboNOH(c)
      if (values.volume !== '') acc.cy += Number(values.volume) || 0
      if (values.area !== '') acc.sf += Number(values.area) || 0
      const face = computeAvgFace(values.volume, values.area)
      if (face != null) { acc.face += face; acc.faceCount += 1 }
      return acc
    },
    { goh: 0, noh: 0, cy: 0, sf: 0, face: 0, faceCount: 0 },
  )

  return {
    combos,
    persistedByKey,
    persistCombo,
    comboCellValue,
    setComboCellValue,
    commitComboCell,
    comboTotals,
    unassignedCombo,
  }
}
