import { useEffect, useRef, useState } from 'react'
import { readWrittenRecordId } from '../../data'
import { buildCombosFromActivities, comboNOH, comboKey, isUnassigned } from '../../lib/productionCombos'
import { computeAvgFace, num } from '../../lib/productionValues'

const DEBOUNCE_MS = 2000

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
  const [saveState, setSaveState] = useState({})
  const inFlightByKey = useRef(new Map())
  const timers = useRef(new Map())
  const pending = useRef(new Map())
  const editsRef = useRef(comboEdits)
  const persistRef = useRef(null)

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

  function readCell(combo, field, source) {
    const editKey = `${combo.key}:${field}`
    if (editKey in source) return source[editKey]
    const existing = persistedByKey.get(combo.key)
    return existing?.[field] ?? ''
  }

  const comboCellValue = (combo, field) => readCell(combo, field, comboEdits)

  async function flushCombo(key) {
    const timer = timers.current.get(key)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(key)
    }
    const combo = pending.current.get(key)
    if (!combo) return
    pending.current.delete(key)

    const source = editsRef.current
    const sent = {
      volume: String(readCell(combo, 'volume', source) ?? ''),
      area: String(readCell(combo, 'area', source) ?? ''),
      notes: String(readCell(combo, 'notes', source) ?? ''),
    }
    const patch = {
      volume: num(sent.volume, 1),
      area: num(sent.area, 0),
      notes: sent.notes.trim() || null,
    }

    setSaveState((prev) => ({ ...prev, [key]: 'saving' }))
    try {
      await persistCombo(combo, patch)
      setComboEdits((prev) => {
        const next = {}
        for (const [k, v] of Object.entries(prev)) {
          if (!k.startsWith(`${key}:`)) next[k] = v
          else if (sent[k.slice(key.length + 1)] !== v) next[k] = v
        }
        return next
      })
      setSaveState((prev) => ({ ...prev, [key]: 'saved' }))
    } catch {
      setSaveState((prev) => ({ ...prev, [key]: 'error' }))
    }
  }

  useEffect(() => {
    editsRef.current = comboEdits
    persistRef.current = flushCombo
  })

  useEffect(
    () => () => {
      for (const key of Array.from(pending.current.keys())) void persistRef.current?.(key)
      timers.current.forEach((t) => clearTimeout(t))
      timers.current.clear()
    },
    [],
  )

  function setComboCellValue(combo, field, value) {
    setComboEdits((prev) => ({ ...prev, [`${combo.key}:${field}`]: value }))
    pending.current.set(combo.key, combo)
    setSaveState((prev) => ({ ...prev, [combo.key]: 'pending' }))
    const existing = timers.current.get(combo.key)
    if (existing) clearTimeout(existing)
    timers.current.set(combo.key, setTimeout(() => void flushCombo(combo.key), DEBOUNCE_MS))
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
    flushCombo,
    comboSaveState: saveState,
    comboTotals,
    unassignedCombo,
  }
}
