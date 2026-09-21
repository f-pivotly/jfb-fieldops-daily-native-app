import { useState } from 'react'
import { Box, Button, Select, Table, Text, TextInput } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import { hoursBetween } from '../../lib/eventTotals'
import { isProductiveActivity } from '../../lib/workType'
import { deriveCap, num, LIFT_THICKNESS_WARN_IN } from '../../../../lib/productionValues'

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
  const [capEdits, setCapEdits] = useState({})

  const multiLayer = layers.length > 1
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

  function areaCombinationsFor(g) {
    return [g.areaId, g.subAreaId, g.subSubAreaId]
      .filter(Boolean)
      .map((id) => ({ area_level_id: areasById.get(id)?.area_level_id ?? null, area_id: id, label: areasById.get(id)?.name ?? null }))
  }

  async function addCappingRow(g, layerId) {
    await create({
      report_id: report.id,
      equipment_id: selectedEquipmentId,
      area_level_combinations: areaCombinationsFor(g),
      layer_id: layerId ?? null,
      material_id: soleMaterialFor(layerId ?? null),
      conversion_factor: project?.cap_conversion_factor ?? null,
    })
  }

  async function handleDelete(row) {
    if (!(await confirm('Delete this production stat row?'))) return
    await remove(row.id)
  }

  function capCellValue(row, field) {
    const editKey = `${row.id}:${field}`
    if (editKey in capEdits) return capEdits[editKey]
    if (field === 'conversion_factor' && row.conversion_factor == null) {
      return project?.cap_conversion_factor != null ? String(project.cap_conversion_factor) : ''
    }
    return row[field] != null ? String(row[field]) : ''
  }

  function setCapCellValue(row, field, value) {
    setCapEdits((prev) => ({ ...prev, [`${row.id}:${field}`]: value }))
  }

  async function commitCapCell(row, field, digits) {
    const editKey = `${row.id}:${field}`
    if (!(editKey in capEdits)) return
    const raw = capEdits[editKey]
    const value = field === 'pass_value' ? (String(raw ?? '').trim() || null) : num(raw, digits)
    setCapEdits((prev) => {
      const next = { ...prev }
      delete next[editKey]
      return next
    })
    if (value === (row[field] ?? null)) return
    const patch = { [field]: value }
    if (field === 'tons' || field === 'conversion_factor') {
      const tons = field === 'tons' ? value : num(capCellValue(row, 'tons'), 2)
      const factor = field === 'conversion_factor' ? value : num(capCellValue(row, 'conversion_factor'), 4)
      patch.volume = deriveCap(tons, factor, null).cy
      patch.conversion_factor = factor
    }
    await update(row.id, patch)
  }

  let totTons = 0, totCy = 0, totSf = 0
  for (const r of rows) {
    const tons = num(capCellValue(r, 'tons'), 2)
    const factor = num(capCellValue(r, 'conversion_factor'), 4)
    const sf = num(capCellValue(r, 'area'), 0)
    const { cy } = deriveCap(tons, factor, sf)
    if (tons != null) totTons += tons
    if (cy != null) totCy += cy
    if (sf != null) totSf += sf
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

  return (
    <Table withTableBorder verticalSpacing="xs" fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{multiLayer ? 'Area / Layer' : 'Area'}</Table.Th>
          {!multiLayer && <Table.Th>Lift</Table.Th>}
          <Table.Th>Material</Table.Th>
          {!multiLayer && <Table.Th ta="right">GOH</Table.Th>}
          {!multiLayer && <Table.Th ta="right">NOH</Table.Th>}
          <Table.Th ta="right">Tons</Table.Th>
          <Table.Th ta="right">Factor</Table.Th>
          <Table.Th ta="right">CY</Table.Th>
          <Table.Th ta="right">SF</Table.Th>
          <Table.Th ta="right">Thk (in)</Table.Th>
          <Table.Th ta="right">Acres</Table.Th>
          <Table.Th>Notes</Table.Th>
          <Table.Th style={{ width: 40 }} />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {cappingGroups.map((g) => {
          const groupRows = rowsForGroup(g)
          const used = new Set(groupRows.map((r) => r.layer_id).filter(Boolean))
          const remaining = sortedLayers.filter((l) => !used.has(l.id))
          const areaLabel = g.unassigned
            ? 'Unassigned'
            : [g.areaId, g.subAreaId, g.subSubAreaId].filter(Boolean).map((id) => areasById.get(id)?.name).filter(Boolean).join(' ‣ ')
          const cols = multiLayer ? 12 : 13

          const renderRow = (r, showAreaCell) => {
            const tons = num(capCellValue(r, 'tons'), 2)
            const factor = num(capCellValue(r, 'conversion_factor'), 4)
            const sf = num(capCellValue(r, 'area'), 0)
            const { cy, thickness, acres } = deriveCap(tons, factor, sf)
            const overTarget = thickness != null && thickness > LIFT_THICKNESS_WARN_IN
            return (
              <Table.Tr key={r.id}>
                <Table.Td style={multiLayer ? { paddingLeft: 24 } : undefined}>
                  {multiLayer
                    ? (layers.find((l) => l.id === r.layer_id)?.layer_name ?? '—')
                    : (showAreaCell ? areaLabel : '')}
                </Table.Td>
                {!multiLayer && (
                  <Table.Td>
                    <TextInput
                      size="xs" ta="right" w={56}
                      value={capCellValue(r, 'pass_value')}
                      onChange={(e) => setCapCellValue(r, 'pass_value', e.currentTarget.value)}
                      onBlur={() => commitCapCell(r, 'pass_value', 0)}
                    />
                  </Table.Td>
                )}
                <Table.Td>
                  <Select
                    size="xs" placeholder="—"
                    data={materialsForLayer(r.layer_id).map((m) => ({ value: m.id, label: m.material_name }))}
                    value={r.material_id ?? null}
                    onChange={(v) => update(r.id, { material_id: v ?? null })}
                    clearable
                  />
                </Table.Td>
                {!multiLayer && <Table.Td ta="right" c="dimmed">{g.goh.toFixed(2)}</Table.Td>}
                {!multiLayer && <Table.Td ta="right" c="dimmed">{g.noh.toFixed(2)}</Table.Td>}
                <Table.Td>
                  <TextInput
                    size="xs" ta="right"
                    value={capCellValue(r, 'tons')}
                    onChange={(e) => setCapCellValue(r, 'tons', e.currentTarget.value)}
                    onBlur={() => commitCapCell(r, 'tons', 2)}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs" ta="right"
                    value={capCellValue(r, 'conversion_factor')}
                    onChange={(e) => setCapCellValue(r, 'conversion_factor', e.currentTarget.value)}
                    onBlur={() => commitCapCell(r, 'conversion_factor', 4)}
                  />
                </Table.Td>
                <Table.Td ta="right" c="dimmed">{cy != null ? cy.toFixed(1) : '—'}</Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs" ta="right"
                    value={capCellValue(r, 'area')}
                    onChange={(e) => setCapCellValue(r, 'area', e.currentTarget.value)}
                    onBlur={() => commitCapCell(r, 'area', 0)}
                  />
                </Table.Td>
                <Table.Td ta="right" c={overTarget ? 'orange.8' : 'dimmed'} fw={overTarget ? 700 : 400}>
                  {thickness != null ? thickness.toFixed(2) : '—'}
                  {overTarget && <span title={`Placed lift over the ${LIFT_THICKNESS_WARN_IN} in target`}> ⚠</span>}
                </Table.Td>
                <Table.Td ta="right" c="dimmed">{acres != null ? acres.toFixed(2) : '—'}</Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    defaultValue={r.notes ?? ''}
                    onBlur={(e) => {
                      const v = e.currentTarget.value.trim() || null
                      if (v !== (r.notes ?? null)) update(r.id, { notes: v })
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <Box onClick={() => handleDelete(r)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }} title="Delete">
                    <IconTrash size={13} />
                  </Box>
                </Table.Td>
              </Table.Tr>
            )
          }

          if (!multiLayer) {
            const only = groupRows[0]
            return only
              ? [renderRow(only, true)]
              : [
                  <Table.Tr key={`new-${g.key}`} style={g.unassigned ? { background: 'var(--mantine-color-yellow-0)' } : undefined}>
                    <Table.Td>{g.unassigned ? <Text span fs="italic" c="orange.8">Unassigned</Text> : areaLabel}</Table.Td>
                    <Table.Td colSpan={cols - 1}>
                      <Button size="compact-xs" variant="subtle" disabled={g.unassigned}
                        onClick={() => addCappingRow(g, sortedLayers[0]?.id ?? null)}>
                        + Add production for this area
                      </Button>
                    </Table.Td>
                  </Table.Tr>,
                ]
          }

          return [
            <Table.Tr key={`hdr-${g.key}`} style={{ background: g.unassigned ? 'var(--mantine-color-yellow-0)' : 'var(--mantine-color-gray-1)' }}>
              <Table.Td fw={700}>
                {g.unassigned ? <Text span fs="italic" c="orange.8">Unassigned</Text> : areaLabel}
              </Table.Td>
              <Table.Td colSpan={cols - 1}>
                <Text size="xs" c="dimmed">
                  GOH <strong>{g.goh.toFixed(2)}</strong> · NOH <strong>{g.noh.toFixed(2)}</strong>
                </Text>
              </Table.Td>
            </Table.Tr>,
            ...groupRows.map((r) => renderRow(r, false)),
            remaining.length > 0 && !g.unassigned && (
              <Table.Tr key={`add-${g.key}`}>
                <Table.Td colSpan={cols} style={{ paddingLeft: 24 }}>
                  <Select
                    size="xs" w={260} placeholder="+ Add layer placed in this area"
                    data={remaining.map((l) => ({ value: l.id, label: l.layer_name }))}
                    value={null}
                    onChange={(v) => v && addCappingRow(g, v)}
                  />
                </Table.Td>
              </Table.Tr>
            ),
          ]
        })}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr>
          <Table.Td colSpan={multiLayer ? 2 : 3} fw={700}>
            Totals
            <Text span size="xs" c="dimmed" fw={400}>
              {'  '}GOH {cappingGroups.reduce((a, g) => a + g.goh, 0).toFixed(2)} · NOH{' '}
              {cappingGroups.reduce((a, g) => a + g.noh, 0).toFixed(2)}
            </Text>
          </Table.Td>
          {!multiLayer && <Table.Td colSpan={2} />}
          <Table.Td ta="right" fw={700}>{totTons.toFixed(2)}</Table.Td>
          <Table.Td />
          <Table.Td ta="right" fw={700}>{totCy.toFixed(1)}</Table.Td>
          <Table.Td ta="right" fw={700}>{totSf.toFixed(0)}</Table.Td>
          <Table.Td />
          <Table.Td />
          <Table.Td />
          <Table.Td />
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  )
}
