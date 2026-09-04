import { useEffect, useRef, useState } from 'react'
import { Box, Table, TextInput, Select, SimpleGrid, Button, Group, Text } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import { useProductionStats } from './hooks/useProductionStats'
import { useProjectAreas } from '../../../hooks/useProjectAreas'
import { useProjectAttachments } from '../../../hooks/useProjectAttachments'
import { useProjectLayers } from '../../../hooks/useProjectLayers'
import { useProjectMaterials } from '../../../hooks/useProjectMaterials'
import { useProjectLayerMaterials } from '../../../hooks/useProjectLayerMaterials'
import { useConfirmDialog } from '../../../hooks/useConfirmDialog'
import { usePicklist } from '../../../hooks/usePicklist'
import { useAppConfig } from '../../../contexts/appConfigContext'
import { useDomainData } from '../../../hooks/useDomainData'
import { fetchDomainRecords } from '../../../data'
import { utcDayRange, sameCalendarDay } from '../lib/reportPdfData'
import { buildCombosFromActivities, comboNOH, comboKey, isUnassigned } from '../../../lib/productionCombos'
import { chartSfForCombo, chartCyForCombo, uncoveredCoverage } from '../../../lib/dredge/productionLink'
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

// Natural-key of a persisted jfb_production_stats row, in the same shape
// comboKey() expects -- area_level_combinations is [{area_id}, ...] in
// root-to-leaf order (l1, l2, l3), matching an activity's own
// area_id/sub_area_id/sub_sub_area_id.
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

export default function ProductionStatsTab({ project, report, equipment = [], selectedEquipmentId }) {
  const { config } = useAppConfig()
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { stats, loading, error, update, remove, create } = useProductionStats(report?.id)
  const { areas, loading: areasLoading } = useProjectAreas(project?.id)
  const { attachments } = useProjectAttachments(project?.id)
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

  // Capping only -- pre-seeded rows (one per equipment x area x layer),
  // unchanged from before. Dredging rows are computed fresh from the day's
  // events below instead (see DREDGE_FEATURE_GAPS.md's "Pull SF+CY from
  // chart" row); pre-seeding a row for every project area regardless of
  // whether anything was worked there is exactly what that redesign drops.
  const seeding = useRef(false)
  useEffect(() => {
    if (!isCapping) return
    if (!report?.id || loading || areasLoading) return
    if (stats.length > 0 || equipment.length === 0 || areas.length === 0) return
    if (layers.length === 0) return
    if (seeding.current) return
    seeding.current = true
    const areasById = new Map(areas.map((a) => [a.id, a]))
    const leaves = leafAreas(areas)
    ;(async () => {
      for (const eq of equipment) {
        for (const area of leaves) {
          for (const layer of layers) {
            await create({
              report_id: report.id,
              equipment_id: eq.id,
              area_level_combinations: areaCombo(area, areasById),
              layer_id: layer.id,
            })
          }
        }
      }
    })().finally(() => {
      seeding.current = false
    })
  }, [isCapping, report?.id, loading, areasLoading, stats.length, equipment, areas, create, layers])

  const rows = stats.filter((s) => s.equipment_id === selectedEquipmentId)

  // --- Dredging (non-capping) only: combos computed from the day's events ---

  // null = not loaded yet (drives activitiesLoading below); [] = loaded, none
  // today. Only ever set from inside the promise continuation, never
  // synchronously in the effect body -- matches the pattern the rest of this
  // app's own data-fetching effects already use (e.g. WeeklySummaryPage.jsx's
  // production effect).
  const [activities, setActivities] = useState(null)
  useEffect(() => {
    if (isCapping || !project?.id || !report?.report_date || !selectedEquipmentId) return undefined
    let cancelled = false
    const { gte, lt } = utcDayRange(report.report_date)
    fetchDomainRecords({
      domain: 'jfb_daily_activities', system: 'core', appSlug: config.appSlug,
      filters: { project_id: project.id, equipment_id: selectedEquipmentId, start_date_time: { gte, lt } },
      limit: 1000,
    })
      .then((res) => {
        if (cancelled) return
        const rowsForDay = (res?.data ?? []).filter((a) => sameCalendarDay(a.start_date_time, report.report_date, a.timezone))
        setActivities(rowsForDay)
      })
      .catch(() => { if (!cancelled) setActivities([]) })
    return () => { cancelled = true }
  }, [isCapping, project?.id, report?.report_date, selectedEquipmentId, config.appSlug])
  const activitiesLoading = !isCapping && activities === null

  const { records: dredgeProgressRecords } = useDomainData({ domain: 'jfb_dredge_progress', system: 'core', projectId: project?.id })
  const { records: dredgeConfigRecords } = useDomainData({ domain: 'jfb_dredge_config', system: 'core', projectId: project?.id })
  const dredgeProgress = dredgeProgressRecords.find((r) => r.report_id === report?.id && r.equipment_id === selectedEquipmentId) ?? null
  const chartBreakdown = dredgeProgress?.cell_breakdown ?? []
  const chartTodaySf = dredgeProgress?.today_sqft ?? null
  const chartTodayCy = dredgeProgress?.adjusted_cy ?? null
  const volumeOn = (dredgeConfigRecords[0]?.volume_mode ?? null) != null
  const chartSaved = chartBreakdown.length > 0 || (chartTodaySf != null && chartTodaySf > 0)

  const areasById = new Map(areas.map((a) => [a.id, a]))
  const attachmentsById = new Map(attachments.map((a) => [a.id, a]))

  const combos = buildCombosFromActivities(activities ?? [], { passKeyOf: (a) => a.pass_type }).map((c) => ({
    ...c,
    areaLabel: areasById.get(c.areaId)?.name ?? null,
    subAreaLabel: areasById.get(c.subAreaId)?.name ?? null,
    subSubAreaLabel: areasById.get(c.subSubAreaId)?.name ?? null,
    passLabel: c.passKey ? (passTypeLabels?.[c.passKey] ?? c.passKey) : null,
    attachmentLabel: c.attachmentId ? (attachmentsById.get(c.attachmentId)?.name ?? null) : null,
  }))
  const persistedByKey = new Map(rows.map((p) => [comboKeyOfPersisted(p), p]))

  // Per-combo, in-flight-chained create-or-update -- prevents the exact race
  // reference documented an incident over (2026-06-30, FL Victor Buhr: two
  // rapid edits both read rowId=null and both inserted, doubling the CY).
  // Native commits on blur rather than reference's 2s debounce, but the same
  // race exists the moment a combo's first save is still in flight when its
  // second field is blurred, so the same in-flight chaining applies here.
  const inFlightByKey = useRef(new Map())
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
      return { id: created?.data?.id ?? null }
    })()
    inFlightByKey.current.set(combo.key, chain)
    try {
      return await chain
    } finally {
      if (inFlightByKey.current.get(combo.key) === chain) inFlightByKey.current.delete(combo.key)
    }
  }

  const [comboEdits, setComboEdits] = useState({})
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

  // "Pull SF + CY from chart" -- reference's ChartSfControls, ported.
  const worked = combos.filter((c) => !isUnassigned(c))
  const targets = chartBreakdown.length > 0
    ? worked
        .map((c) => ({ combo: c, sf: chartSfForCombo(chartBreakdown, c.areaLabel, c.passKey), cy: chartCyForCombo(chartBreakdown, c.areaLabel, c.passKey) }))
        .filter((t) => t.sf != null)
    : (chartTodaySf != null && chartTodaySf > 0 && worked.length === 1
        ? [{ combo: worked[0], sf: Math.round(chartTodaySf), cy: chartTodayCy != null ? Math.round(chartTodayCy) : null }]
        : [])
  const flatMulti = chartBreakdown.length === 0 && chartTodaySf != null && chartTodaySf > 0 && worked.length > 1
  const hasChartCy = targets.some((t) => t.cy != null)
  const flags = chartBreakdown.length > 0 ? uncoveredCoverage(chartBreakdown, worked) : []

  const [fillBusy, setFillBusy] = useState(false)
  const [fillStatus, setFillStatus] = useState(null)

  async function fillFromChart(rowsToFill) {
    setFillBusy(true); setFillStatus(null)
    let n = 0, nCy = 0
    try {
      for (const { combo, sf, cy: chartCy } of rowsToFill) {
        const existing = persistedByKey.get(combo.key)
        const sfMatches = existing?.area != null && Math.round(existing.area) === sf
        const cy = chartCy ?? existing?.volume ?? null
        const cyMatches = chartCy == null || (existing?.volume != null && Math.round(existing.volume) === chartCy)
        if (sfMatches && cyMatches) continue
        await persistCombo(combo, {
          volume: cy,
          area: sf,
          notes: existing?.notes ?? null,
        })
        n++
        if (chartCy != null && !cyMatches) nCy++
      }
      setFillStatus(`Filled ${n} row${n === 1 ? '' : 's'} from the chart${nCy ? ` (CY on ${nCy})` : ''}.`)
    } catch (e) {
      setFillStatus(e.message || 'Could not fill SF from the chart.')
    } finally {
      setFillBusy(false)
    }
  }

  async function onPullFromChart() {
    const conflicts = targets.filter((t) => {
      const existing = persistedByKey.get(t.combo.key)
      const sfClash = existing?.area != null && Math.round(existing.area) !== t.sf
      const cyClash = t.cy != null && existing?.volume != null && Math.round(existing.volume) !== t.cy
      return sfClash || cyClash
    })
    if (conflicts.length) {
      const list = conflicts
        .map((t) => {
          const existing = persistedByKey.get(t.combo.key)
          const parts = [`${existing?.area?.toLocaleString() ?? '—'} → ${t.sf.toLocaleString()} sq ft`]
          if (t.cy != null) parts.push(`${existing?.volume?.toLocaleString() ?? '—'} → ${t.cy.toLocaleString()} CY`)
          return `${t.combo.areaLabel ?? ''} ${t.combo.passLabel ?? ''}: ${parts.join(', ')}`
        })
        .join('\n')
      if (!(await confirm(
        `${conflicts.length} row(s) already have different values you entered. Overwrite them with the chart values?\n\n${list}\n\n(Rows you haven't filled will be set either way.)`,
      ))) {
        await fillFromChart(targets.filter((t) => !conflicts.includes(t)))
        return
      }
    }
    await fillFromChart(targets)
  }

  async function handleDelete(row) {
    if (!(await confirm('Delete this production stat row?'))) return
    await remove(row.id)
  }

  const totalVolume = rows.reduce((a, r) => a + (Number(r.volume) || 0), 0)
  const totalArea = rows.reduce((a, r) => a + (Number(r.area) || 0), 0)

  const comboTotals = worked.reduce(
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

  const isHydraulic = (project?.work_type || '').toLowerCase().includes('hydraulic')
  const showFlowAndPipe = !!project?.is_pipe_tracking && isHydraulic
  const stillLoading = loading || areasLoading || (!isCapping && activitiesLoading)

  return (
    <Box>
      {stillLoading && <LoadingSpinner py={16} />}
      {!stillLoading && <SafeError message={error} />}

      {!stillLoading && !error && !isCapping && (
        <>
          <Group mb={10} gap={10} align="center" wrap="wrap">
            <Button size="xs" disabled={fillBusy || targets.length === 0} loading={fillBusy} onClick={onPullFromChart}>
              {hasChartCy ? 'Pull SF + CY from chart' : 'Pull SF from chart'}
            </Button>
            <Text size="xs" c="dimmed">
              {!chartSaved
                ? 'Generate and save the daily chart on the Dredge Progress tab, then come back here to pull its Area SF (and estimated CY, if this project has volume turned on) into the rows below.'
                : chartBreakdown.length
                  ? `Fills Area SF${hasChartCy ? ' and estimated CY' : ''} on matching DMU + pass rows from the saved dredge chart.`
                  : `Fills the day's Area SF${hasChartCy ? ' and estimated CY' : ''} from the saved dredge chart${chartTodaySf ? ` (${Math.round(chartTodaySf).toLocaleString()} sq ft${chartTodayCy != null ? `, ${Math.round(chartTodayCy).toLocaleString()} CY` : ''})` : ''}.`}
              {chartSaved && targets.length === 0 && !flatMulti &&
                (chartBreakdown.length ? ' No matching rows yet — log the DMU/pass in the Event Log first.' : ' No production row yet — log the Area/Pass in the Event Log first.')}
            </Text>
            {fillStatus && <Text size="xs" c="teal">{fillStatus}</Text>}
          </Group>

          {chartSaved && volumeOn && !hasChartCy && (
            <Box p={10} mb={10} style={{ background: '#fbf1dd', border: '1px solid #e6cb87', borderRadius: 6 }}>
              <Text size="xs">
                This day's saved chart has no estimated CY, so only Area SF can be pulled. It was likely saved before this
                project's volume setup was finished — the Dredge Progress tab recalculates every time it opens, so
                re-generate and Save the chart there, then return here.
              </Text>
            </Box>
          )}

          {flatMulti && (
            <Box p={10} mb={10} style={{ background: '#fbf1dd', border: '1px solid #e6cb87', borderRadius: 6 }}>
              <Text size="xs">
                The chart's coverage ({Math.round(chartTodaySf).toLocaleString()} sq ft) spans more than one area today, so
                it can't be auto-assigned — enter Area SF per row below.
              </Text>
            </Box>
          )}

          {flags.length > 0 && (
            <Box p={10} mb={10} style={{ background: '#fbf1dd', border: '1px solid #e6cb87', borderRadius: 6 }}>
              <Text size="xs" fw={600}>The chart shows coverage in {flags.length} area(s) with no reported time:</Text>
              {flags.map((f) => (
                <Text key={`${f.label}-${f.pass}`} size="xs">
                  {f.label} {f.pass === 1 ? '1st' : '2nd'} pass — {f.sf.toLocaleString()} sq ft dredged, but no event covers
                  it. Add the time in the Event Log so production reports accurately.
                </Text>
              ))}
            </Box>
          )}
        </>
      )}

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
                    defaultValue={r.volume ?? ''}
                    onBlur={(e) => {
                      const v = num(e.currentTarget.value, 1)
                      if (v !== (r.volume ?? null)) update(r.id, { volume: v })
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    ta="right"
                    defaultValue={r.area ?? ''}
                    onBlur={(e) => {
                      const v = num(e.currentTarget.value, 0)
                      if (v !== (r.area ?? null)) update(r.id, { area: v })
                    }}
                  />
                </Table.Td>
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
        worked.length === 0 ? (
          <Box p={24} style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8, textAlign: 'center' }}>
            <Text size="sm" fw={500}>No production rows yet.</Text>
            <Text size="xs" c="dimmed" mt={4}>
              Rows appear once operator events log time with an area for this equipment.
            </Text>
          </Box>
        ) : (
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
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {worked.map((c) => (
              <Table.Tr key={c.key} style={isUnassigned(c) ? { background: 'var(--mantine-color-yellow-0)' } : undefined}>
                <Table.Td>{isUnassigned(c) ? <Text span fs="italic" c="orange.8">Unassigned</Text> : (c.areaLabel ?? '—')}</Table.Td>
                <Table.Td>{c.subAreaLabel ?? '—'}</Table.Td>
                <Table.Td>{c.subSubAreaLabel ?? '—'}</Table.Td>
                <Table.Td c="dimmed">{c.passLabel ?? '—'}</Table.Td>
                <Table.Td c="dimmed">{tscaLabel(c.tsca)}</Table.Td>
                <Table.Td ta="right" c="dimmed">{c.timeHours.toFixed(2)}</Table.Td>
                <Table.Td ta="right" c="dimmed">{comboNOH(c).toFixed(2)}</Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    ta="right"
                    value={comboCellValue(c, 'volume')}
                    onChange={(e) => setComboCellValue(c, 'volume', e.currentTarget.value)}
                    onBlur={() => commitComboCell(c, 'volume', 1)}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    ta="right"
                    value={comboCellValue(c, 'area')}
                    onChange={(e) => setComboCellValue(c, 'area', e.currentTarget.value)}
                    onBlur={() => commitComboCell(c, 'area', 0)}
                  />
                </Table.Td>
                <Table.Td ta="right" c="dimmed">
                  {(() => {
                    const face = computeAvgFace(comboCellValue(c, 'volume'), comboCellValue(c, 'area'))
                    return face != null ? face.toFixed(2) : '—'
                  })()}
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    value={comboCellValue(c, 'notes')}
                    onChange={(e) => setComboCellValue(c, 'notes', e.currentTarget.value)}
                    onBlur={() => commitComboCell(c, 'notes', null)}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Td colSpan={5} fw={700}>Totals</Table.Td>
              <Table.Td ta="right" fw={700}>{comboTotals.goh.toFixed(2)}</Table.Td>
              <Table.Td ta="right" fw={700}>{comboTotals.noh.toFixed(2)}</Table.Td>
              <Table.Td ta="right" fw={700}>{comboTotals.cy.toFixed(1)}</Table.Td>
              <Table.Td ta="right" fw={700}>{comboTotals.sf.toFixed(0)}</Table.Td>
              <Table.Td ta="right" fw={700}>{comboTotals.faceCount > 0 ? (comboTotals.face / comboTotals.faceCount).toFixed(2) : '—'}</Table.Td>
              <Table.Td />
            </Table.Tr>
          </Table.Tfoot>
        </Table>
        )
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
