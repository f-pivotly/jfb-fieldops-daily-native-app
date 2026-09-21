import { useEffect, useRef, useState } from 'react'
import { Box, Button, Group, Select, Table, Text, TextInput } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import { readWrittenRecordId } from '../../../../data'
import SaveIndicator from '../../../../components/SaveIndicator'
import { hoursBetween } from '../../lib/eventTotals'
import { isProductiveActivity } from '../../lib/workType'
import { deriveCap, fmt, num, LIFT_THICKNESS_WARN_IN } from '../../../../lib/productionValues'

const DEBOUNCE_MS = 1500

const areaKeyOf = (areaId, subAreaId, subSubAreaId) =>
  `${areaId ?? ''}|${subAreaId ?? ''}|${subSubAreaId ?? ''}`

function areaKeyOfPersisted(p) {
  const c = Array.isArray(p.area_level_combinations) ? p.area_level_combinations : []
  return areaKeyOf(c[0]?.area_id ?? null, c[1]?.area_id ?? null, c[2]?.area_id ?? null)
}

function buildCappingAreaGroups(acts) {
  const m = new Map()
  for (const a of acts ?? []) {
    const areaId = a.area?.area_id ?? null
    const subAreaId = a.area?.sub_area_id ?? null
    const subSubAreaId = a.area?.sub_sub_area_id ?? null
    const key = areaKeyOf(areaId, subAreaId, subSubAreaId)
    let g = m.get(key)
    if (!g) {
      g = { key, areaId, subAreaId, subSubAreaId, goh: 0, noh: 0, unassigned: !areaId }
      m.set(key, g)
    }
    const hrs = hoursBetween(a.start_date_time, a.end_date_time)
    g.goh += hrs
    if (isProductiveActivity(a)) g.noh += hrs
  }
  return [...m.values()].filter((g) => !g.unassigned || g.goh > 0.001)
}

export default function CappingProductionTable({
  project,
  report,
  rows,
  activities,
  layers,
  materials,
  layerMaterials,
  areasById,
  selectedEquipmentId,
  create,
  update,
  remove,
  confirm,
}) {
  const [drafts, setDrafts] = useState({})
  const [slots, setSlots] = useState({})
  const [saveState, setSaveState] = useState({})
  const slotSeq = useRef(0)
  const timers = useRef(new Map())
  const pending = useRef(new Map())
  const createdIds = useRef({})
  const draftsRef = useRef(drafts)
  const rowsRef = useRef(rows)
  useEffect(() => {
    draftsRef.current = drafts
    rowsRef.current = rows
  })

  const multiLayer = layers.length > 1
  const factorDefault = project?.cap_conversion_factor != null ? String(project.cap_conversion_factor) : ''
  const materialsForLayer = (layerId) => {
    if (!layerId) return materials
    const mapped = layerMaterials.filter((lm) => lm.layer_id === layerId).map((lm) => lm.material_id)
    if (mapped.length === 0) return materials
    const validIds = new Set(mapped)
    return materials.filter((m) => validIds.has(m.id))
  }
  const soleMaterialFor = (layerId) => {
    const mats = materialsForLayer(layerId)
    return mats.length === 1 ? mats[0].id : null
  }
  const materialName = (id) => materials.find((m) => m.id === id)?.material_name ?? null

  const cappingGroups = buildCappingAreaGroups(activities ?? [])
  const rowsByArea = new Map()
  for (const r of rows) {
    const k = areaKeyOfPersisted(r)
    const list = rowsByArea.get(k)
    if (list) list.push(r)
    else rowsByArea.set(k, [r])
  }
  const sortedLayers = [...(layers ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const layerOrderIndex = new Map(sortedLayers.map((l, i) => [l.id, i]))
  const rowsForGroup = (g) =>
    [...(rowsByArea.get(g.key) ?? [])].sort(
      (a, b) => (layerOrderIndex.get(a.layer_id) ?? 999) - (layerOrderIndex.get(b.layer_id) ?? 999),
    )

  function entriesForGroup(g) {
    const saved = rowsForGroup(g).map((r) => ({ key: r.id, row: r }))
    const extra = (slots[g.key] ?? []).map((key) => ({ key, row: null }))
    const list = [...saved, ...extra]
    if (list.length === 0 && (!g.unassigned || !multiLayer)) {
      list.push({ key: `${g.key}##blank`, row: null })
    }
    return list
  }

  function readCell(entry, field, source) {
    const k = `${entry.key}:${field}`
    if (k in source) return source[k]
    if (field === 'conversion_factor') {
      return entry.row?.conversion_factor != null ? String(entry.row.conversion_factor) : factorDefault
    }
    return entry.row?.[field] != null ? String(entry.row[field]) : ''
  }

  const cellValue = (entry, field) => readCell(entry, field, drafts)

  function layerIdOf(entry, source = drafts) {
    const k = `${entry.key}:layer_id`
    if (k in source) return source[k] || null
    if (entry.row) return entry.row.layer_id ?? null
    return multiLayer ? null : (sortedLayers[0]?.id ?? null)
  }

  function materialIdOf(entry, source = drafts) {
    const k = `${entry.key}:material_id`
    if (k in source) return source[k] || null
    if (entry.row) return entry.row.material_id ?? null
    return soleMaterialFor(layerIdOf(entry, source))
  }

  function settleDrafts(entryKey, newId, sent) {
    setDrafts((prev) => {
      const next = {}
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(`${entryKey}:`)) {
          next[k] = v
          continue
        }
        const field = k.slice(entryKey.length + 1)
        if (sent[field] === v) continue
        if (newId) next[`${newId}:${field}`] = v
      }
      return next
    })
  }

  function clearEntryDrafts(entryKey) {
    setDrafts((prev) => {
      const next = {}
      for (const [k, v] of Object.entries(prev)) if (!k.startsWith(`${entryKey}:`)) next[k] = v
      return next
    })
  }

  function markSaved(oldKey, newId) {
    setSaveState((prev) => {
      const next = { ...prev, [oldKey]: 'saved' }
      if (newId && newId !== oldKey) next[newId] = 'saved'
      return next
    })
  }

  function addSlot(g) {
    slotSeq.current += 1
    const key = `${g.key}##new${slotSeq.current}`
    setSlots((prev) => ({ ...prev, [g.key]: [...(prev[g.key] ?? []), key] }))
  }

  function dropSlot(groupKey, slotKey) {
    setSlots((prev) => {
      const list = prev[groupKey]
      if (!list?.includes(slotKey)) return prev
      return { ...prev, [groupKey]: list.filter((k) => k !== slotKey) }
    })
  }

  function areaCombinationsFor(g) {
    return [g.areaId, g.subAreaId, g.subSubAreaId]
      .filter(Boolean)
      .map((id) => ({ area_level_id: areasById.get(id)?.area_level_id ?? null, area_id: id, label: areasById.get(id)?.name ?? null }))
  }

  async function persist(key) {
    const timer = timers.current.get(key)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(key)
    }
    const item = pending.current.get(key)
    if (!item) return
    pending.current.delete(key)

    const source = draftsRef.current
    const createdId = createdIds.current[key]
    const resolved =
      item.entry.row ??
      (createdId ? rowsRef.current.find((r) => r.id === createdId) ?? { id: createdId } : null)
    const entry = { key, row: resolved }
    const g = item.g

    const layerId = layerIdOf(entry, source)
    if (!resolved && multiLayer && !layerId) return

    const sent = {
      layer_id: layerId ?? '',
      material_id: materialIdOf(entry, source) ?? '',
      pass_value: readCell(entry, 'pass_value', source),
      tons: readCell(entry, 'tons', source),
      conversion_factor: readCell(entry, 'conversion_factor', source),
      area: readCell(entry, 'area', source),
      notes: readCell(entry, 'notes', source),
    }
    const tons = num(sent.tons, 2)
    const factor = num(sent.conversion_factor, 4)
    const sf = num(sent.area, 0)
    const fields = {
      tons,
      conversion_factor: factor,
      area: sf,
      volume: deriveCap(tons, factor, sf).cy,
      notes: sent.notes.trim() || null,
      pass_value: multiLayer ? null : (sent.pass_value.trim() || null),
    }

    setSaveState((prev) => ({ ...prev, [key]: 'saving' }))
    try {
      if (resolved) {
        await update(resolved.id, fields)
        settleDrafts(key, resolved.id, sent)
        markSaved(key, resolved.id)
        return
      }
      const res = await create({
        report_id: report.id,
        equipment_id: selectedEquipmentId,
        area_level_combinations: areaCombinationsFor(g),
        layer_id: layerId,
        material_id: materialIdOf(entry, source),
        ...fields,
      })
      const newId = readWrittenRecordId(res)
      if (newId) createdIds.current[key] = newId
      settleDrafts(key, newId, sent)
      dropSlot(g.key, key)
      markSaved(key, newId)
    } catch {
      setSaveState((prev) => ({ ...prev, [key]: 'error' }))
    }
  }

  function scheduleSave(entry, g) {
    pending.current.set(entry.key, { entry, g })
    setSaveState((prev) => ({ ...prev, [entry.key]: 'pending' }))
    const existing = timers.current.get(entry.key)
    if (existing) clearTimeout(existing)
    timers.current.set(entry.key, setTimeout(() => void persist(entry.key), DEBOUNCE_MS))
  }

  useEffect(
    () => () => {
      for (const key of Array.from(pending.current.keys())) void persist(key)
      timers.current.forEach((t) => clearTimeout(t))
      timers.current.clear()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  function setCell(entry, g, field, value) {
    setDrafts((prev) => ({ ...prev, [`${entry.key}:${field}`]: value }))
    scheduleSave(entry, g)
  }

  async function setLayer(entry, g, layerId) {
    if (!layerId) return
    if (entry.row) {
      setSaveState((prev) => ({ ...prev, [entry.key]: 'saving' }))
      try {
        await update(entry.row.id, { layer_id: layerId, material_id: soleMaterialFor(layerId) })
        markSaved(entry.key, entry.row.id)
      } catch {
        setSaveState((prev) => ({ ...prev, [entry.key]: 'error' }))
      }
      return
    }
    setDrafts((prev) => ({
      ...prev,
      [`${entry.key}:layer_id`]: layerId,
      [`${entry.key}:material_id`]: soleMaterialFor(layerId) ?? '',
    }))
    pending.current.set(entry.key, { entry, g })
    await persist(entry.key)
  }

  async function setMaterial(entry, g, materialId) {
    if (entry.row) {
      setSaveState((prev) => ({ ...prev, [entry.key]: 'saving' }))
      try {
        await update(entry.row.id, { material_id: materialId ?? null })
        markSaved(entry.key, entry.row.id)
      } catch {
        setSaveState((prev) => ({ ...prev, [entry.key]: 'error' }))
      }
      return
    }
    setCell(entry, g, 'material_id', materialId ?? '')
  }

  async function handleDelete(entry, g) {
    if (!entry.row) {
      clearEntryDrafts(entry.key)
      dropSlot(g.key, entry.key)
      return
    }
    if (!(await confirm('Delete this production stat row?'))) return
    await remove(entry.row.id)
  }

  if (layers.length === 0) {
    return (
      <Box p={16} style={{ background: '#eef4fb', border: '1px solid #c7dcf5', borderRadius: 6 }}>
        <Text size="sm">
          No cap layers configured for this project. Add them under{' '}
          <strong>Admin → Capping Setup</strong> before entering placement production.
        </Text>
      </Box>
    )
  }

  if (cappingGroups.length === 0) {
    return (
      <Box p={16} style={{ background: '#eef4fb', border: '1px solid #c7dcf5', borderRadius: 6 }}>
        <Text size="sm">
          No placement activity yet. Log <strong>ACTIVE PLACEMENT</strong> events on the{' '}
          <strong>Event Log</strong> tab with the area — each area appears here as a row to enter{' '}
          {multiLayer ? 'the layer, Tons and SF' : 'the Lift, Tons and SF'} against.
        </Text>
      </Box>
    )
  }

  const groupEntries = cappingGroups.map((g) => ({ g, entries: entriesForGroup(g) }))

  let totTons = 0, totCy = 0, totSf = 0
  for (const { entries } of groupEntries) {
    for (const entry of entries) {
      const tons = num(cellValue(entry, 'tons'), 2)
      const factor = num(cellValue(entry, 'conversion_factor'), 4)
      const sf = num(cellValue(entry, 'area'), 0)
      const { cy } = deriveCap(tons, factor, sf)
      if (tons != null) totTons += tons
      if (cy != null) totCy += cy
      if (sf != null) totSf += sf
    }
  }

  return (
    <>
      <Table withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{multiLayer ? 'Area / Layer' : 'Area'}</Table.Th>
            {!multiLayer && <Table.Th>Lift</Table.Th>}
            {!multiLayer && <Table.Th>Material</Table.Th>}
            {!multiLayer && <Table.Th ta="right">GOH</Table.Th>}
            {!multiLayer && <Table.Th ta="right">NOH</Table.Th>}
            <Table.Th ta="right">Tons</Table.Th>
            <Table.Th ta="right">Factor</Table.Th>
            <Table.Th ta="right">CY</Table.Th>
            <Table.Th ta="right">SF</Table.Th>
            <Table.Th ta="right">Thk (in)</Table.Th>
            <Table.Th ta="right">Acres</Table.Th>
            <Table.Th>Notes</Table.Th>
            <Table.Th style={{ width: 96 }} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {groupEntries.map(({ g, entries }) => {
            const used = new Set()
            for (const entry of entries) {
              const id = layerIdOf(entry)
              if (id) used.add(id)
            }
            const remaining = sortedLayers.filter((l) => !used.has(l.id))
            const areaLabel = g.unassigned
              ? 'Unassigned'
              : [g.areaId, g.subAreaId, g.subSubAreaId].filter(Boolean).map((id) => areasById.get(id)?.name).filter(Boolean).join(' ‣ ')
            const cols = multiLayer ? 9 : 13
            const disabled = g.unassigned

            const renderRow = (entry, showAreaCell) => {
              const tons = num(cellValue(entry, 'tons'), 2)
              const factor = num(cellValue(entry, 'conversion_factor'), 4)
              const sf = num(cellValue(entry, 'area'), 0)
              const { cy, thickness, acres } = deriveCap(tons, factor, sf)
              const overTarget = thickness != null && thickness > LIFT_THICKNESS_WARN_IN
              const entryLayerId = layerIdOf(entry)
              const entryMaterialId = materialIdOf(entry)
              return (
                <Table.Tr key={entry.key}>
                  <Table.Td style={multiLayer ? { paddingLeft: 24 } : undefined}>
                    {multiLayer ? (
                      <Group gap={8} wrap="nowrap">
                        <Select
                          size="xs"
                          w={200}
                          placeholder="Select layer…"
                          disabled={disabled}
                          data={sortedLayers
                            .filter((l) => l.id === entryLayerId || !used.has(l.id))
                            .map((l) => ({ value: l.id, label: l.layer_name }))}
                          value={entryLayerId}
                          onChange={(v) => setLayer(entry, g, v)}
                        />
                        {entryMaterialId && <Text size="xs" c="dimmed">{materialName(entryMaterialId)}</Text>}
                      </Group>
                    ) : (showAreaCell ? areaLabel : '')}
                  </Table.Td>
                  {!multiLayer && (
                    <Table.Td>
                      <TextInput
                        size="xs" ta="right" w={56}
                        disabled={disabled}
                        value={cellValue(entry, 'pass_value')}
                        onChange={(e) => setCell(entry, g, 'pass_value', e.currentTarget.value)}
                        onBlur={() => persist(entry.key)}
                      />
                    </Table.Td>
                  )}
                  {!multiLayer && (
                    <Table.Td>
                      {materialsForLayer(entryLayerId).length > 1 ? (
                        <Select
                          size="xs" placeholder="—"
                          disabled={disabled}
                          data={materialsForLayer(entryLayerId).map((m) => ({ value: m.id, label: m.material_name }))}
                          value={entryMaterialId}
                          onChange={(v) => setMaterial(entry, g, v)}
                          clearable
                        />
                      ) : (
                        <Text size="sm">{materialName(entryMaterialId) ?? '—'}</Text>
                      )}
                    </Table.Td>
                  )}
                  {!multiLayer && <Table.Td ta="right" c="dimmed">{fmt(g.goh, 2)}</Table.Td>}
                  {!multiLayer && <Table.Td ta="right" c="dimmed">{fmt(g.noh, 2)}</Table.Td>}
                  <Table.Td>
                    <TextInput
                      size="xs" ta="right"
                      disabled={disabled}
                      value={cellValue(entry, 'tons')}
                      onChange={(e) => setCell(entry, g, 'tons', e.currentTarget.value)}
                      onBlur={() => persist(entry.key)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs" ta="right"
                      disabled={disabled}
                      value={cellValue(entry, 'conversion_factor')}
                      onChange={(e) => setCell(entry, g, 'conversion_factor', e.currentTarget.value)}
                      onBlur={() => persist(entry.key)}
                    />
                  </Table.Td>
                  <Table.Td ta="right" c="dimmed">{fmt(cy, 1)}</Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs" ta="right"
                      disabled={disabled}
                      value={cellValue(entry, 'area')}
                      onChange={(e) => setCell(entry, g, 'area', e.currentTarget.value)}
                      onBlur={() => persist(entry.key)}
                    />
                  </Table.Td>
                  <Table.Td ta="right" c={overTarget ? 'orange.8' : 'dimmed'} fw={overTarget ? 700 : 400}>
                    {fmt(thickness, 2)}
                    {overTarget && <span title={`Placed lift over the ${LIFT_THICKNESS_WARN_IN} in target`}> ⚠</span>}
                  </Table.Td>
                  <Table.Td ta="right" c="dimmed">{fmt(acres, 2)}</Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      disabled={disabled}
                      value={cellValue(entry, 'notes')}
                      onChange={(e) => setCell(entry, g, 'notes', e.currentTarget.value)}
                      onBlur={() => persist(entry.key)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap" justify="flex-end">
                      <SaveIndicator state={saveState[entry.key]} />
                      {!disabled && (entry.row || entries.length > 1) && (
                        <Box
                          onClick={() => handleDelete(entry, g)}
                          style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }}
                          title={entry.row ? 'Delete' : 'Remove this row'}
                        >
                          <IconTrash size={13} />
                        </Box>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              )
            }

            if (!multiLayer) return entries.map((entry, i) => renderRow(entry, i === 0))

            return [
              <Table.Tr key={`hdr-${g.key}`} style={{ background: g.unassigned ? 'var(--mantine-color-yellow-0)' : 'var(--mantine-color-gray-1)' }}>
                <Table.Td fw={700}>
                  {g.unassigned ? <Text span fs="italic" c="orange.8">Unassigned</Text> : areaLabel}
                </Table.Td>
                <Table.Td colSpan={cols - 1}>
                  <Text size="xs" c="dimmed">
                    GOH <strong>{fmt(g.goh, 2)}</strong> · NOH <strong>{fmt(g.noh, 2)}</strong>
                  </Text>
                </Table.Td>
              </Table.Tr>,
              ...entries.map((entry) => renderRow(entry, false)),
              remaining.length > 0 && !g.unassigned && (
                <Table.Tr key={`add-${g.key}`}>
                  <Table.Td colSpan={cols} style={{ paddingLeft: 24 }}>
                    <Button size="compact-xs" variant="subtle" onClick={() => addSlot(g)}>
                      + Add layer
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ),
            ]
          })}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr>
            <Table.Td colSpan={multiLayer ? 1 : 3} fw={700}>
              Totals
              <Text span size="xs" c="dimmed" fw={400}>
                {'  '}GOH {fmt(cappingGroups.reduce((a, g) => a + g.goh, 0), 2)} · NOH{' '}
                {fmt(cappingGroups.reduce((a, g) => a + g.noh, 0), 2)}
              </Text>
            </Table.Td>
            {!multiLayer && <Table.Td colSpan={2} />}
            <Table.Td ta="right" fw={700}>{fmt(totTons, 1)}</Table.Td>
            <Table.Td />
            <Table.Td ta="right" fw={700}>{fmt(totCy, 1)}</Table.Td>
            <Table.Td ta="right" fw={700}>{fmt(totSf, 1)}</Table.Td>
            <Table.Td />
            <Table.Td />
            <Table.Td />
            <Table.Td />
          </Table.Tr>
        </Table.Tfoot>
      </Table>

      <Text size="xs" c="dimmed" mt={6}>
        {multiLayer ? (
          <>
            Areas come from the event log; <strong>GOH/NOH</strong> are summed from that area&apos;s events
            and sit on the area header, so hours never double-count when several layers are placed in a
            day. Add one row per <strong>layer</strong> placed and enter its <strong>Tons</strong> and{' '}
            <strong>SF</strong>. Each layer&apos;s tons roll up against its own design-tons goal.
          </>
        ) : (
          <>
            One row per area from the event log. <strong>GOH/NOH</strong> are summed from that area&apos;s
            events (Totals match the event-log daily totals). Enter the <strong>Lift</strong>,{' '}
            <strong>Tons</strong> and <strong>SF</strong>; CY = tons ÷ factor, thickness = CY × 324 ÷ SF.
          </>
        )}
      </Text>
    </>
  )
}
