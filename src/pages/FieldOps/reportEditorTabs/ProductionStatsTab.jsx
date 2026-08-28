import { useEffect, useRef, useState } from 'react'
import { Box, Table, Text, TextInput, SimpleGrid } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import { useProductionStats } from './hooks/useProductionStats'
import { useProjectAreas } from '../../../hooks/useProjectAreas'
import { useConfirmDialog } from '../../../hooks/useConfirmDialog'
import { useGohNoh } from '../../../hooks/useGohNoh'
import { usePicklist } from '../../../hooks/usePicklist'
import { FlowStatsPanel, PipeConfigPanel } from './components/FlowStatsPanel'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'

// Mirrors the real web app's dredging ProductionStatsTable columns/layout.
// AREA/SUB-AREA/SUB-SUB-AREA come from area_level_combinations (breadcrumb
// split by depth). CY/SF/Notes map to the domain's real volume/area/notes
// columns and are editable. Pass/TSCA are real columns, still not collected
// by any form in this app (they render blank until something writes them --
// see EventLogTab.jsx). GOH/NOH are computed server-side per row by
// dvw-jfb-goh/dvw-jfb-noh (see useGohNoh.js), grouping jfb_daily_activities
// by this row's own Area+Pass+TSCA+Attachment combo -- added once
// jfb_daily_activities gained attachment_id (2026-08-27). Avg Face Ft is
// computed client-side from this row's own volume/area -- (CY x 27) / SF,
// same formula and same "always derive, never trust a stored value" approach
// as the real web app's computeAvgFace() in ProductionStatsTable.tsx. No
// data view: both inputs are already loaded in this row, so there's nothing
// to fetch -- see conversation notes on why a data view would be the wrong
// tool for a same-row pure calculation.
function comboAt(combo, depth) {
  if (!Array.isArray(combo)) return '—'
  return combo[depth]?.label ?? '—'
}

function num(v, digits) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null
}

// Avg Face ft = (CY x 27) / SF -- 1 cubic yard = 27 cubic feet, so
// volume_ft3 / area_sf = average depth in feet. Accepts raw cell values
// (string while being typed, number/null once fetched) so callers can pass
// cellValue() output directly without pre-parsing.
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

// Areas form a tree via parent_id (jfb_project_areas). A "leaf" area is one
// nothing else points at as a parent -- the deepest, most specific place
// production actually happens. Using every area (not just leaves) would
// double-count: a parent area and its own sub-area would both become rows.
function leafAreas(areas) {
  const parentIds = new Set(areas.map((a) => a.parent_id).filter(Boolean))
  return areas.filter((a) => a.is_active !== false && !parentIds.has(a.id))
}

// Resolves one leaf area's full root-to-leaf breadcrumb by walking parent_id,
// in the same [{area_level_id, area_id, label}] shape AreaCombinationPicker
// builds when a user manually cascades through the level selects.
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
  const rows = stats.filter((s) => s.equipment_id === selectedEquipmentId)
  const { labels: passTypeLabels } = usePicklist('pkl-jfb-pass-type')
  const gohNohById = useGohNoh(rows, {
    projectId: project?.id,
    reportDate: report?.report_date,
    equipmentId: selectedEquipmentId,
    passTypeLabels,
  })

  // Local text state per row+field so typing doesn't fight the refetch that
  // follows every save. Keyed by `${rowId}:${field}`; falls back to the
  // fetched value whenever there's no in-progress edit for that cell.
  const [edits, setEdits] = useState({})
  function cellValue(row, field) {
    const key = `${row.id}:${field}`
    return key in edits ? edits[key] : (row[field] ?? '')
  }
  function setCellValue(row, field, value) {
    setEdits((prev) => ({ ...prev, [`${row.id}:${field}`]: value }))
  }
  async function commitCell(row, field, digits) {
    const key = `${row.id}:${field}`
    if (!(key in edits)) return
    const value = digits != null ? num(edits[key], digits) : (edits[key].trim() || null)
    setEdits((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    if (value === (row[field] ?? null)) return
    await update(row.id, { [field]: value })
  }

  // Auto-create one row per (equipment x leaf area) the first time this
  // report has none yet -- there's no manual "Add row" here, matching the
  // real web app where production_stats rows come from context, not a form.
  // Guarded on the report's TOTAL stats (not just this tab's selected
  // equipment) so it only ever seeds once per report.
  const seeding = useRef(false)
  useEffect(() => {
    if (!report?.id || loading || areasLoading) return
    if (stats.length > 0 || equipment.length === 0 || areas.length === 0) return
    if (seeding.current) return
    seeding.current = true
    const areasById = new Map(areas.map((a) => [a.id, a]))
    const leaves = leafAreas(areas)
    ;(async () => {
      for (const eq of equipment) {
        for (const area of leaves) {
          await create({
            report_id: report.id,
            equipment_id: eq.id,
            area_level_combinations: areaCombo(area, areasById),
          })
        }
      }
    })().finally(() => {
      seeding.current = false
    })
  }, [report?.id, loading, areasLoading, stats.length, equipment, areas, create])

  async function handleDelete(row) {
    if (!(await confirm('Delete this production stat row?'))) return
    await remove(row.id)
  }

  const totalVolume = rows.reduce((a, r) => a + (Number(r.volume) || 0), 0)
  const totalArea = rows.reduce((a, r) => a + (Number(r.area) || 0), 0)
  const totalGoh = rows.reduce((a, r) => a + (gohNohById[r.id]?.goh ?? 0), 0)
  const totalNoh = rows.reduce((a, r) => a + (gohNohById[r.id]?.noh ?? 0), 0)
  // Averaged (not summed) across rows that have a value -- summing a
  // per-row depth across different areas isn't a meaningful number.
  const faceValues = rows
    .map((r) => computeAvgFace(cellValue(r, 'volume'), cellValue(r, 'area')))
    .filter((v) => v != null)
  const avgFaceTotal = faceValues.length > 0 ? faceValues.reduce((a, v) => a + v, 0) / faceValues.length : null

  // Flow Stats + Pipe Configuration only apply to hydraulic projects with
  // pipe tracking on -- same gate as the real web app's
  // ProductionStatsTab.tsx (showFlowAndPipe), minus the phase-split lookup:
  // jfb_projects has no placement_start_date/prior_work_type, so work_type
  // is read directly.
  const isHydraulic = (project?.work_type || '').toLowerCase().includes('hydraulic')
  const showFlowAndPipe = !!project?.is_pipe_tracking && isHydraulic

  return (
    <Box>
      {(loading || areasLoading) && <LoadingSpinner py={16} />}
      {!loading && <SafeError message={error} />}

      {!loading && !areasLoading && !error && (
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
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={12}>
                  <Text size="xs" c="dimmed" ta="center" py={12}>No production stats yet.</Text>
                </Table.Td>
              </Table.Tr>
            )}
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
          {rows.length > 0 && (
            // Table.Td (not Table.Th) here on purpose: the theme's global `th`
            // style is white text, meant for the navy thead -- reusing it in
            // the footer would render invisible white-on-white text.
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
          )}
        </Table>
      )}

      {showFlowAndPipe && report?.report_date && (
        <SimpleGrid cols={{ base: 1, md: 2 }} mt={16}>
          {/* key forces a remount (clearing in-progress edits) whenever the
              equipment tab or report date changes, instead of syncing local
              state back to the fetched row via an effect. */}
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
