import { useEffect, useRef, useState } from 'react'
import { Box, Table, TextInput, Select, SimpleGrid } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import { useProductionStats } from './hooks/useProductionStats'
import { useProjectAreas } from '../../../hooks/useProjectAreas'
import { useProjectLayers } from '../../../hooks/useProjectLayers'
import { useProjectMaterials } from '../../../hooks/useProjectMaterials'
import { useProjectLayerMaterials } from '../../../hooks/useProjectLayerMaterials'
import { useConfirmDialog } from '../../../hooks/useConfirmDialog'
import { useGohNoh } from '../../../hooks/useGohNoh'
import { usePicklist } from '../../../hooks/usePicklist'
import { FlowStatsPanel, PipeConfigPanel } from './components/FlowStatsPanel'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'

function comboAt(combo, depth) {
  if (!Array.isArray(combo)) return '—'
  return combo[depth]?.label ?? '—'
}

function num(v, digits) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null
}

function computeAvgFace(volume, area) {
  const v = volume === null || volume === undefined || volume === '' ? null : Number(volume)
  const a = area === null || area === undefined || area === '' ? null : Number(area)
  if (v === null || a === null || !Number.isFinite(v) || !Number.isFinite(a) || a === 0) return null
  return (v * 27) / a
}

function tscaLabel(tsca) {
  if (tsca === true) return 'Yes'
  if (tsca === false) return 'No'
  return '—'
}

function leafAreas(areas) {
  const parentIds = new Set(areas.map((a) => a.parent_id).filter(Boolean))
  return areas.filter((a) => !parentIds.has(a.id))
}

function areaCombo(area, areasById) {
  const path = []
  let cur = area
  while (cur) {
    path.unshift({ area_level_id: cur.area_level_id, area_id: cur.id, label: cur.name })
    cur = cur.parent_id ? areasById.get(cur.parent_id) : null
  }
  return path
}

export default function ProductionStatsTab({ project, report, equipment = [], selectedEquipmentId }) {
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { stats, loading, error, update, remove, create } = useProductionStats(report?.id)
  const { areas, loading: areasLoading } = useProjectAreas(project?.id)
  const { labels: passTypeLabels } = usePicklist('pkl-jfb-pass-type')

  const isCapping = (project?.work_type || '').toLowerCase().includes('cap')
  const { layers } = useProjectLayers(project?.id)
  const { materials } = useProjectMaterials(project?.id)
  const { layerMaterials } = useProjectLayerMaterials(project?.id)
  const multiLayer = layers.length > 1
  const materialsForLayer = (layerId) => {
    if (!layerId) return materials
    const mapped = layerMaterials.filter((lm) => lm.layer_id === layerId).map((lm) => lm.material_id)
    const validIds = new Set(mapped)
    return materials.filter((m) => validIds.has(m.id))
  }

  const seeding = useRef(false)
  useEffect(() => {
    if (!report?.id || loading || areasLoading) return
    if (stats.length > 0 || equipment.length === 0 || areas.length === 0) return
    if (isCapping && layers.length === 0) return
    if (seeding.current) return
    seeding.current = true
    const areasById = new Map(areas.map((a) => [a.id, a]))
    const leaves = leafAreas(areas)
    ;(async () => {
      for (const eq of equipment) {
        for (const area of leaves) {
          if (isCapping) {
            for (const layer of layers) {
              await create({
                report_id: report.id,
                equipment_id: eq.id,
                area_level_combinations: areaCombo(area, areasById),
                layer_id: layer.id,
              })
            }
          } else {
            await create({
              report_id: report.id,
              equipment_id: eq.id,
              area_level_combinations: areaCombo(area, areasById),
            })
          }
        }
      }
    })().finally(() => {
      seeding.current = false
    })
  }, [report?.id, loading, areasLoading, stats.length, equipment, areas, create, isCapping, layers])

  const rows = stats.filter((s) => s.equipment_id === selectedEquipmentId)

  const gohNohById = useGohNoh(rows, {
    projectId: project?.id,
    reportDate: report?.report_date,
    equipmentId: selectedEquipmentId,
    passTypeLabels,
  })

  const [edits, setEdits] = useState({})
  function cellValue(row, field) {
    const editKey = `${row.id}:${field}`
    return editKey in edits ? edits[editKey] : (row[field] ?? '')
  }
  function setCellValue(row, field, value) {
    setEdits((prev) => ({ ...prev, [`${row.id}:${field}`]: value }))
  }
  async function commitCell(row, field, digits) {
    const editKey = `${row.id}:${field}`
    if (!(editKey in edits)) return
    const value = digits != null ? num(edits[editKey], digits) : (edits[editKey].trim() || null)
    setEdits((prev) => {
      const next = { ...prev }
      delete next[editKey]
      return next
    })
    if (value === (row[field] ?? null)) return
    await update(row.id, { [field]: value })
  }

  async function handleDelete(row) {
    if (!(await confirm('Delete this production stat row?'))) return
    await remove(row.id)
  }

  const totalVolume = rows.reduce((a, r) => a + (Number(cellValue(r, 'volume')) || 0), 0)
  const totalArea = rows.reduce((a, r) => a + (Number(cellValue(r, 'area')) || 0), 0)
  const totalGoh = rows.reduce((a, r) => a + (gohNohById[r.id]?.goh ?? 0), 0)
  const totalNoh = rows.reduce((a, r) => a + (gohNohById[r.id]?.noh ?? 0), 0)
  const faceValues = rows
    .map((r) => computeAvgFace(cellValue(r, 'volume'), cellValue(r, 'area')))
    .filter((v) => v != null)
  const avgFaceTotal = faceValues.length > 0 ? faceValues.reduce((a, v) => a + v, 0) / faceValues.length : null

  const isHydraulic = (project?.work_type || '').toLowerCase().includes('hydraulic')
  const showFlowAndPipe = !!project?.is_pipe_tracking && isHydraulic
  const stillLoading = loading || areasLoading

  return (
    <Box>
      {stillLoading && <LoadingSpinner py={16} />}
      {!stillLoading && <SafeError message={error} />}

      {!stillLoading && !error && isCapping && (
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Area</Table.Th>
              <Table.Th>Sub-Area</Table.Th>
              <Table.Th>Sub-Sub-Area</Table.Th>
              {multiLayer && <Table.Th>Layer</Table.Th>}
              <Table.Th>Material</Table.Th>
              <Table.Th ta="right">CY</Table.Th>
              <Table.Th ta="right">SF</Table.Th>
              <Table.Th>Notes</Table.Th>
              <Table.Th style={{ width: 40 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{comboAt(r.area_level_combinations, 0)}</Table.Td>
                <Table.Td>{comboAt(r.area_level_combinations, 1)}</Table.Td>
                <Table.Td>{comboAt(r.area_level_combinations, 2)}</Table.Td>
                {multiLayer && (
                  <Table.Td>{layers.find((l) => l.id === r.layer_id)?.layer_name ?? '—'}</Table.Td>
                )}
                <Table.Td>
                  <Select
                    size="xs"
                    placeholder="—"
                    data={materialsForLayer(r.layer_id).map((m) => ({ value: m.id, label: m.material_name }))}
                    value={r.material_id ?? null}
                    onChange={(v) => update(r.id, { material_id: v ?? null })}
                    clearable
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    ta="right"
                    value={cellValue(r, 'volume')}
                    onChange={(e) => setCellValue(r, 'volume', e.currentTarget.value)}
                    onBlur={() => commitCell(r, 'volume', 1)}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    ta="right"
                    value={cellValue(r, 'area')}
                    onChange={(e) => setCellValue(r, 'area', e.currentTarget.value)}
                    onBlur={() => commitCell(r, 'area', 0)}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    value={cellValue(r, 'notes')}
                    onChange={(e) => setCellValue(r, 'notes', e.currentTarget.value)}
                    onBlur={() => commitCell(r, 'notes', null)}
                  />
                </Table.Td>
                <Table.Td>
                  <Box onClick={() => handleDelete(r)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }} title="Delete">
                    <IconTrash size={13} />
                  </Box>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Td colSpan={multiLayer ? 5 : 4} fw={700}>Totals</Table.Td>
              <Table.Td ta="right" fw={700}>{totalVolume.toFixed(1)}</Table.Td>
              <Table.Td ta="right" fw={700}>{totalArea.toFixed(0)}</Table.Td>
              <Table.Td />
              <Table.Td />
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      )}

      {!stillLoading && !error && !isCapping && (
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Area</Table.Th>
              <Table.Th>Sub-Area</Table.Th>
              <Table.Th>Sub-Sub-Area</Table.Th>
              <Table.Th>Pass</Table.Th>
              <Table.Th>TSCA</Table.Th>
              <Table.Th ta="right">GOH</Table.Th>
              <Table.Th ta="right">NOH</Table.Th>
              <Table.Th ta="right">CY</Table.Th>
              <Table.Th ta="right">SF</Table.Th>
              <Table.Th ta="right">Avg Face Ft *</Table.Th>
              <Table.Th>Notes</Table.Th>
              <Table.Th style={{ width: 40 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{comboAt(r.area_level_combinations, 0)}</Table.Td>
                <Table.Td>{comboAt(r.area_level_combinations, 1)}</Table.Td>
                <Table.Td>{comboAt(r.area_level_combinations, 2)}</Table.Td>
                <Table.Td c="dimmed">{r.pass_value || '—'}</Table.Td>
                <Table.Td c="dimmed">{tscaLabel(r.tsca)}</Table.Td>
                <Table.Td ta="right" c="dimmed">{(gohNohById[r.id]?.goh ?? 0).toFixed(2)}</Table.Td>
                <Table.Td ta="right" c="dimmed">{(gohNohById[r.id]?.noh ?? 0).toFixed(2)}</Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    ta="right"
                    value={cellValue(r, 'volume')}
                    onChange={(e) => setCellValue(r, 'volume', e.currentTarget.value)}
                    onBlur={() => commitCell(r, 'volume', 1)}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    ta="right"
                    value={cellValue(r, 'area')}
                    onChange={(e) => setCellValue(r, 'area', e.currentTarget.value)}
                    onBlur={() => commitCell(r, 'area', 0)}
                  />
                </Table.Td>
                <Table.Td ta="right" c="dimmed">
                  {(() => {
                    const face = computeAvgFace(cellValue(r, 'volume'), cellValue(r, 'area'))
                    return face != null ? face.toFixed(2) : '—'
                  })()}
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    value={cellValue(r, 'notes')}
                    onChange={(e) => setCellValue(r, 'notes', e.currentTarget.value)}
                    onBlur={() => commitCell(r, 'notes', null)}
                  />
                </Table.Td>
                <Table.Td>
                  <Box onClick={() => handleDelete(r)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }} title="Delete">
                    <IconTrash size={13} />
                  </Box>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Td colSpan={5} fw={700}>Totals</Table.Td>
              <Table.Td ta="right" fw={700}>{totalGoh.toFixed(2)}</Table.Td>
              <Table.Td ta="right" fw={700}>{totalNoh.toFixed(2)}</Table.Td>
              <Table.Td ta="right" fw={700}>{totalVolume.toFixed(1)}</Table.Td>
              <Table.Td ta="right" fw={700}>{totalArea.toFixed(0)}</Table.Td>
              <Table.Td ta="right" fw={700}>{avgFaceTotal != null ? avgFaceTotal.toFixed(2) : '—'}</Table.Td>
              <Table.Td />
              <Table.Td />
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      )}

      {showFlowAndPipe && report?.report_date && (
        <SimpleGrid cols={{ base: 1, md: 2 }} mt={16}>
          <FlowStatsPanel
            key={`${selectedEquipmentId}:${report.report_date}`}
            projectId={project.id}
            equipmentId={selectedEquipmentId}
            reportDateISO={report.report_date}
          />
          <PipeConfigPanel key={report.report_date} projectId={project.id} reportDateISO={report.report_date} />
        </SimpleGrid>
      )}

      {confirmModal}
    </Box>
  )
}
