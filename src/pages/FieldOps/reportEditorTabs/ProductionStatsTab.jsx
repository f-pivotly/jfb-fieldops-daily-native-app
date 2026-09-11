import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Table, TextInput, Select, SimpleGrid, Button, Group, Text } from '@mantine/core'
import WarningBanner from './components/WarningBanner'
import { IconTrash } from '@tabler/icons-react'
import { useProductionStats } from './hooks/useProductionStats'
import { useProjectAreas } from '../../../hooks/useProjectAreas'
import { useProjectAttachments } from '../../../hooks/useProjectAttachments'
import { useProjectLayers } from '../../../hooks/useProjectLayers'
import { useProjectMaterials } from '../../../hooks/useProjectMaterials'
import { useProjectLayerMaterials } from '../../../hooks/useProjectLayerMaterials'
import { useConfirmDialog } from '../../../hooks/useConfirmDialog'
import { usePicklist } from '../../../hooks/usePicklist'
import { equipmentWorkType } from '../lib/workType'
import { useDomainData } from '../../../hooks/useDomainData'
import { readWrittenRecordId } from '../../../data'
import { useDayActivities } from './hooks/useDayActivities'
import { buildCombosFromActivities, comboNOH, comboKey, isUnassigned } from '../../../lib/productionCombos'
import { chartSfForCombo, chartCyForCombo, uncoveredCoverage } from '../../../lib/dredge/productionLink'
import { FlowStatsPanel, PipeConfigPanel } from './components/FlowStatsPanel'
import BucketSfControls from './components/BucketSfControls'
import { usePlacementConfig } from '../../../hooks/usePlacementConfig'
import { loadPlacementGrid } from '../../../lib/placement/loaders'
import { attributeBuckets, windowsFromActivities } from '../../../lib/placement/attribution'
import { isProductiveActivity } from '../lib/workType'
import { hoursBetween } from '../lib/eventTotals'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'

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

const SF_PER_ACRE = 43560
const LIFT_THICKNESS_WARN_IN = 4

function deriveCap(tons, factor, sf) {
  const cy = tons != null && factor != null && factor !== 0 ? tons / factor : null
  const thickness = cy != null && sf != null && sf !== 0 ? (cy * 324) / sf : null
  const acres = sf != null && sf !== 0 ? sf / SF_PER_ACRE : null
  return { cy, thickness, acres }
}

function tscaLabel(tsca) {
  if (tsca === true) return 'Yes'
  if (tsca === false) return 'No'
  return '—'
}

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
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { stats, loading, error, update, remove, create } = useProductionStats(report?.id)
  const { areas, loading: areasLoading } = useProjectAreas(project?.id)
  const { attachments } = useProjectAttachments(project?.id)
  const { labels: passTypeLabels } = usePicklist('pkl-jfb-pass-type')

  const selectedEquipment = equipment.find((eq) => eq.id === selectedEquipmentId) ?? null
  const resolvedWorkType = equipmentWorkType(project, selectedEquipment, report?.report_date).toLowerCase()
  const isCapping = resolvedWorkType.includes('cap')
  const { layers } = useProjectLayers(project?.id)
  const { materials } = useProjectMaterials(project?.id)
  const { layerMaterials } = useProjectLayerMaterials(project?.id)
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

  const rows = stats.filter((s) => s.equipment_id === selectedEquipmentId)

  const activities = useDayActivities({
    projectId: project?.id,
    reportDate: report?.report_date,
    equipmentId: selectedEquipmentId,
  })
  const activitiesLoading = activities === null

  const { records: dredgeProgressRecords } = useDomainData({ domain: 'jfb_dredge_progress', system: 'core', reportId: report?.id })
  const { records: dredgeConfigRecords } = useDomainData({ domain: 'jfb_dredge_config', system: 'core', projectId: project?.id })
  const dredgeProgress = dredgeProgressRecords.find((r) => r.equipment_id === selectedEquipmentId) ?? null
  const chartBreakdown = dredgeProgress?.cell_breakdown ?? []
  const chartTodaySf = dredgeProgress?.today_sqft ?? null
  const chartTodayCy = dredgeProgress?.adjusted_cy ?? null
  const volumeOn = (dredgeConfigRecords[0]?.volume_mode ?? null) != null
  const chartSaved = chartBreakdown.length > 0 || (chartTodaySf != null && chartTodaySf > 0)

  const areasById = new Map(areas.map((a) => [a.id, a]))
  const attachmentsById = new Map(attachments.map((a) => [a.id, a]))

  const { config: placementConfig } = usePlacementConfig(isCapping ? project?.id : null)
  const placementGridFileId = placementConfig?.grid_path ?? null
  const placementGridRef = useRef(null)
  const [placementGrid, setPlacementGrid] = useState(null)
  useEffect(() => {
    let alive = true
    const load = placementGridFileId
      ? loadPlacementGrid(placementGridFileId, placementGridRef)
      : Promise.resolve(null)
    load
      .then((g) => { if (alive) setPlacementGrid(g) })
      .catch(() => { if (alive) setPlacementGrid(null) })
    return () => { alive = false }
  }, [placementGridFileId])

  const { records: placementRows } = useDomainData({
    domain: 'jfb_placement_progress', system: 'core', reportId: isCapping ? report?.id : null,
  })

  const placementRow = (placementRows ?? []).find((r) => r.equipment_id === selectedEquipmentId) ?? null

  const layerNameById = useMemo(() => new Map((layers ?? []).map((l) => [l.id, l.layer_name])), [layers])

  const bucketCoverage = useMemo(() => {
    const placements = placementRow?.placements ?? []
    if (!placementGrid || placements.length === 0) return null
    const windows = windowsFromActivities(activities ?? [], layerNameById, isProductiveActivity)
    return attributeBuckets(placements, placementGrid, windows)
  }, [placementRow, placementGrid, activities, layerNameById])

  async function fillBucketSf(row, sf) {
    await update(row.id, { area: sf })
  }

  const cappingGroups = isCapping ? buildCappingAreaGroups(activities ?? []) : []
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

  const combos = buildCombosFromActivities(activities ?? [], { passKeyOf: (a) => a.pass_type }).map((c) => ({
    ...c,
    areaLabel: areasById.get(c.areaId)?.name ?? null,
    subAreaLabel: areasById.get(c.subAreaId)?.name ?? null,
    subSubAreaLabel: areasById.get(c.subSubAreaId)?.name ?? null,
    passLabel: c.passKey ? (passTypeLabels?.[c.passKey] ?? c.passKey) : null,
    attachmentLabel: c.attachmentId ? (attachmentsById.get(c.attachmentId)?.name ?? null) : null,
  }))
  const persistedByKey = new Map(rows.map((p) => [comboKeyOfPersisted(p), p]))

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
      return { id: readWrittenRecordId(created) }
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

  const worked = combos.filter((c) => !isUnassigned(c))
  const shown = combos
  const unassignedCombo = combos.find((c) => isUnassigned(c)) ?? null
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

  const [capEdits, setCapEdits] = useState({})
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
  const capFactorMissing = project?.cap_conversion_factor == null

  const comboTotals = shown.reduce(
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

  const isHydraulic = resolvedWorkType.includes('hydraulic')
  const showFlowAndPipe = !!project?.is_pipe_tracking && isHydraulic
  const stillLoading = loading || areasLoading || (!isCapping && activitiesLoading)

  return (
    <Box>
      {stillLoading && <LoadingSpinner py={16} />}
      {!stillLoading && <SafeError message={error} />}

      {!stillLoading && !error && !isCapping && unassignedCombo && (
        <WarningBanner p={10} mb={10}>
          <Text size="xs" fw={600} c="#7a5206">
            {unassignedCombo.timeHours.toFixed(2)} h logged with no area
          </Text>
          <Text size="xs" c="#7a5206">
            Those hours are shown as an <strong>Unassigned</strong> row below and counted in the totals,
            so they reconcile to the event log — but they can&apos;t be credited to an area until the
            events carry one. Set the area on those events in the Event Log.
          </Text>
        </WarningBanner>
      )}

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
            <WarningBanner p={10} mb={10}>
              <Text size="xs">
                This day's saved chart has no estimated CY, so only Area SF can be pulled. It was likely saved before this
                project's volume setup was finished — the Dredge Progress tab recalculates every time it opens, so
                re-generate and Save the chart there, then return here.
              </Text>
            </WarningBanner>
          )}

          {flatMulti && (
            <WarningBanner p={10} mb={10}>
              <Text size="xs">
                The chart's coverage ({Math.round(chartTodaySf).toLocaleString()} sq ft) spans more than one area today, so
                it can't be auto-assigned — enter Area SF per row below.
              </Text>
            </WarningBanner>
          )}

          {flags.length > 0 && (
            <WarningBanner p={10} mb={10}>
              <Text size="xs" fw={600}>The chart shows coverage in {flags.length} area(s) with no reported time:</Text>
              {flags.map((f) => (
                <Text key={`${f.label}-${f.pass}`} size="xs">
                  {f.label} {f.pass === 1 ? '1st' : '2nd'} pass — {f.sf.toLocaleString()} sq ft dredged, but no event covers
                  it. Add the time in the Event Log so production reports accurately.
                </Text>
              ))}
            </WarningBanner>
          )}
        </>
      )}

      {!stillLoading && !error && isCapping && (
        <>
          {capFactorMissing && (
            <WarningBanner p={10} mb={10}>
              <Text size="xs">
                No project conversion factor set — set the tons/CY factor on this project's{' '}
                <strong>Settings</strong> page so it pre-fills, or enter it per row below. CY can&apos;t compute
                until a factor is entered. Projects paid by the ton can leave this blank.
              </Text>
            </WarningBanner>
          )}
          {bucketCoverage && (
            <BucketSfControls
              coverage={bucketCoverage}
              rows={rows}
              layerNameById={layerNameById}
              onFillSf={fillBucketSf}
              confirm={confirm}
            />
          )}
          {layers.length === 0 ? (
            <Box p={16} style={{ background: '#eef4fb', border: '1px solid #c7dcf5', borderRadius: 6 }}>
              <Text size="sm">
                No cap layers configured for this project. Add them under{' '}
                <strong>Admin → Capping Setup</strong> before entering placement production.
              </Text>
            </Box>
          ) : cappingGroups.length === 0 ? (
            <Box p={16} style={{ background: '#eef4fb', border: '1px solid #c7dcf5', borderRadius: 6 }}>
              <Text size="sm">
                No placement activity yet. Log <strong>ACTIVE PLACEMENT</strong> events on the{' '}
                <strong>Event Log</strong> tab with the area — each area appears here as a row to enter{' '}
                {multiLayer ? 'the layer, Tons and SF' : 'the Lift, Tons and SF'} against.
              </Text>
            </Box>
          ) : (
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
          )}
        </>
      )}

      {!stillLoading && !error && !isCapping && (
        shown.length === 0 ? (
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
            {shown.map((c) => (
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
