import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, FileButton, Group, Stack, Table, Text } from '@mantine/core'
import { useDomainData } from '../../../hooks/core/useDomainData'
import { usePlacementConfig } from '../../../hooks/placement/usePlacementConfig'
import { useProjectLayers } from '../../../hooks/capping/useProjectLayers'
import { useAppConfig } from '../../../contexts/appConfigContext'
import { useAsyncAction } from '../../../hooks/ui/useAsyncAction'
import { useConfirmDialog } from '../../../hooks/ui/useConfirmDialog'
import { loadAttachmentImage, loadPublicImage } from '../../../lib/dredge/imageLoaders'
import { bktGaps, bktTimeSpan, parseBkt } from '../../../lib/placement/bkt'
import {
  activitiesByDay,
  attributeBuckets,
  attributeHistory,
  windowsFromActivities,
} from '../../../lib/placement/attribution'
import {
  buildCellFills,
  buildLiftPalette,
  clippedSqFtForFills,
  liftsFromCoverage,
  materialsFromLifts,
  renderPlacementChart,
  splitPasses,
} from '../../../lib/placement/chart'
import { loadPlacementGrid, loadPlacementReferenceLines } from '../../../lib/placement/loaders'
import { isProductiveActivity } from '../lib/workType'
import { usePlacementProgressSave } from '../../../hooks/placement/usePlacementProgressSave'

const PLACEMENT_PROGRESS_DOMAIN = 'jfb_placement_progress'

const fmtSecs = (s) =>
  s == null ? '—' : `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
const fmtHM = (s) => `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
const num = (n) => Math.round(Number(n) || 0).toLocaleString()

export default function PlacementProgressTab({ project, report, reports, equipment, selectedEquipmentId }) {
  const selected = (equipment ?? []).find((e) => e.id === selectedEquipmentId) ?? null
  const equipmentId = selected?.id ?? null
  const equipmentName = selected?.name ?? ''
  const reportId = report?.id ?? null
  const reportDate = report?.report_date ?? null
  const projectId = project?.id ?? null
  const projectName = project?.name ?? ''
  const { config: userConfig } = useAppConfig()
  const { config, loading: configLoading } = usePlacementConfig(projectId)
  const { layers } = useProjectLayers(projectId)
  const {
    records: progressRecords, loading: progressLoading,
    create: createProgress, update: updateProgress, remove: removeProgress, reload: reloadProgress,
  } = useDomainData({ domain: PLACEMENT_PROGRESS_DOMAIN, system: 'core', projectId })
  const { records: activities } = useDomainData({ domain: 'jfb_daily_activities', system: 'core', projectId })

  const canvasRef = useRef(null)
  const gridRef = useRef(null)
  const refLinesRef = useRef(null)
  const [loaded, setLoaded] = useState({ grid: null, assets: null, error: null })
  const { busy, message: notice, error: uploadError, run: runUpload } = useAsyncAction()
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { grid, assets, error: assetsError } = loaded

  const gridFileId = config?.grid_path ?? null
  const aerialFileId = config?.aerial_path ?? null
  const refLinesFileId = config?.reference_lines_path ?? null
  const configLabel = config?.label ?? null
  const aerialGeoref = config?.aerial_georef ?? null

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!gridFileId) return { grid: null, assets: null, error: null }
      try {
        const [g, referenceLines, aerialImage, logoImage, northImage] = await Promise.all([
          loadPlacementGrid(gridFileId, gridRef),
          loadPlacementReferenceLines(refLinesFileId, refLinesRef),
          loadAttachmentImage(aerialFileId),
          loadPublicImage('/dredge/_assets/logo.jpg'),
          loadPublicImage('/dredge/_assets/north.png'),
        ])
        return { grid: g, assets: { referenceLines, aerialImage, logoImage, northImage }, error: null }
      } catch (err) {
        return { grid: null, assets: null, error: err.message }
      }
    }
    load().then((result) => { if (alive) setLoaded(result) })
    return () => { alive = false }
  }, [gridFileId, aerialFileId, refLinesFileId])

  const reportDateById = useMemo(
    () => new Map((reports ?? []).map((r) => [r.id, r.report_date])),
    [reports],
  )
  const layerNameById = useMemo(
    () => new Map((layers ?? []).map((l) => [l.id, l.layer_report_name || l.layer_name || 'Lift'])),
    [layers],
  )
  const palette = useMemo(() => buildLiftPalette(layers), [layers])

  const existingRow = useMemo(
    () => (progressRecords ?? []).find((r) => r.report_id === reportId && r.equipment_id === equipmentId) ?? null,
    [progressRecords, reportId, equipmentId],
  )
  const priorRows = useMemo(() => {
    if (!equipmentId || !reportDate) return []
    return (progressRecords ?? [])
      .filter((r) => r.equipment_id === equipmentId)
      .map((r) => ({ row: r, date: reportDateById.get(r.report_id) }))
      .filter((c) => c.date && c.date < reportDate)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [progressRecords, equipmentId, reportDate, reportDateById])

  const activitiesByDate = useMemo(() => activitiesByDay(activities, equipmentId), [activities, equipmentId])
  const todayWindows = useMemo(
    () => windowsFromActivities(activitiesByDate.get(reportDate) ?? [], layerNameById, isProductiveActivity),
    [activitiesByDate, reportDate, layerNameById],
  )

  const placements = useMemo(() => existingRow?.placements ?? [], [existingRow])
  const coverage = useMemo(
    () => (grid && placements.length ? attributeBuckets(placements, grid, todayWindows) : null),
    [grid, placements, todayWindows],
  )
  const priorDays = useMemo(() => {
    if (!grid || !priorRows.length) return []
    return attributeHistory(
      priorRows.map((c) => ({ reportDate: c.date, placements: c.row.placements ?? [] })),
      grid, activitiesByDate, layerNameById, isProductiveActivity,
    ).map((d) => d.coverage)
  }, [grid, priorRows, activitiesByDate, layerNameById])

  const lifts = useMemo(() => (coverage ? liftsFromCoverage(coverage, palette.order) : []), [coverage, palette])
  const materials = useMemo(() => materialsFromLifts(lifts), [lifts])
  const passes = useMemo(
    () => (grid ? splitPasses(priorDays, coverage, grid.grid, palette.order) : null),
    [grid, priorDays, coverage, palette],
  )
  const cellFills = useMemo(
    () => buildCellFills(priorDays, coverage, palette.colorFor),
    [priorDays, coverage, palette],
  )
  const clippedSqFt = useMemo(
    () => (grid ? clippedSqFtForFills(grid, cellFills.fills) : 0),
    [grid, cellFills],
  )

  const span = useMemo(() => bktTimeSpan(placements), [placements])
  const gaps = useMemo(() => bktGaps(placements, 15), [placements])
  const idleSecs = useMemo(
    () => gaps.reduce((a, g) => {
      const from = placements.find((p) => p.clock === g.afterClock)?.secs ?? 0
      const to = placements.find((p) => p.clock === g.beforeClock)?.secs ?? 0
      return a + (to - from)
    }, 0),
    [gaps, placements],
  )

  const save = usePlacementProgressSave({
    report, selected, existingRow, updateProgress, reloadProgress, canvasRef,
  })
  const { saving, saved, saveError, resetSaveState, handleSave } = save

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !grid || !assets || !coverage || !passes || !reportDate) return
    try {
      renderPlacementChart(cv, {
        grid,
        cellFills: cellFills.fills,
        passes,
        referenceLines: assets.referenceLines,
        dateISO: reportDate,
        projectTitle: projectName,
        equipmentLabel: equipmentName,
        areaLabel: configLabel || 'Work area',
        aerialImage: assets.aerialImage,
        aerialGeoref,
        logoImage: assets.logoImage,
        northImage: assets.northImage,
        legendLifts: palette.entries,
        materials,
      })
    } catch (err) {
      console.error('Could not draw the placement chart:', err.message)
    }
  }, [grid, assets, coverage, passes, cellFills, palette, materials,
    configLabel, aerialGeoref, reportDate, projectName, equipmentName])

  async function handleFile(file) {
    if (!file) return
    resetSaveState()
    await runUpload(async () => {
      if (!grid) throw new Error('The project\'s bucket grid has not loaded yet.')
      if (!reportId || !equipmentId) throw new Error('Pick the equipment for this report first.')
      const parsed = parseBkt(await file.text())
      if (parsed.placements.length === 0) {
        throw new Error(`No bucket placements found in ${file.name}. Is it a .bkt export?`)
      }
      const cov = attributeBuckets(parsed.placements, grid, todayWindows)
      const sp = bktTimeSpan(parsed.placements)
      const recordData = {
        project_id: projectId,
        report_id: reportId,
        equipment_id: equipmentId,
        source_filename: file.name,
        source_header: parsed.header || null,
        placements: parsed.placements,
        bucket_count: parsed.placements.length,
        first_secs: sp?.firstSecs ?? null,
        last_secs: sp?.lastSecs ?? null,
        distinct_cells: cov.distinctCells,
        today_sqft: cov.distinctSqFt,
        problems: parsed.problems,
        generated_by_user_id: userConfig?.user?.id ?? null,
      }
      if (existingRow) await updateProgress(existingRow.id, recordData)
      else await createProgress(recordData)

      const bits = [`${parsed.placements.length} placements`, `${num(cov.distinctSqFt)} SF`]
      if (parsed.problems.length) bits.push(`${parsed.problems.length} unreadable row(s)`)
      if (cov.outsideGrid) bits.push(`${cov.outsideGrid} outside the grid`)
      return `Loaded ${file.name} — ${bits.join(' · ')}.`
    })
  }

  async function handleRemove() {
    if (!existingRow) return
    const ok = await confirm(`Remove ${existingRow.source_filename ?? 'the bucket file'} from this report?`)
    if (!ok) return
    resetSaveState()
    await runUpload(async () => {
      await removeProgress(existingRow.id)
      return 'Bucket file removed.'
    })
  }

  function handleDownloadPng() {
    const cv = canvasRef.current
    if (!cv || !reportDate) return
    const [y, m, d] = reportDate.split('-')
    const a = document.createElement('a')
    a.href = cv.toDataURL('image/png')
    a.download = `${y.slice(2)}${m}${d} ${equipmentName || 'placement'} Placement Progress.png`
    a.click()
  }

  if (!selected) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Select equipment to load its bucket file.</Text>
  }
  if (configLoading || progressLoading) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Loading placement progress…</Text>
  }
  if (!config?.grid_path) {
    return (
      <Box p={32} style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8, textAlign: 'center' }}>
        <Text size="sm" c="dimmed">
          This project has no bucket grid uploaded yet. A PM/Admin can add it under{' '}
          <Text span fw={500} c="dimmed" inherit>Project Settings → Placement Chart</Text>{' '}
          (the grid lattice, the aerial, and its georeference).
        </Text>
      </Box>
    )
  }

  return (
    <Stack gap="md">
      {confirmModal}
      {assetsError && <Alert color="red" variant="light" title="Chart">{assetsError}</Alert>}
      {uploadError && <Alert color="red" variant="light" title="Bucket file">{uploadError}</Alert>}
      {notice && typeof notice === 'string' && <Alert color="green" variant="light">{notice}</Alert>}
      {saveError && <Alert color="red" variant="light" title="Saving the chart">{saveError}</Alert>}

      <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap={12}>
          <Box>
            <Text fw={600} size="sm">Bucket file (.bkt) — {equipmentName}</Text>
            <Text size="xs" c="dimmed" mt={2}>
              {existingRow
                ? `${existingRow.source_filename ?? 'file'} · ${existingRow.bucket_count ?? 0} placements`
                : 'No bucket file loaded for this day.'}
            </Text>
          </Box>
          <Group gap={8}>
            <FileButton onChange={handleFile} accept=".bkt,text/plain">
              {(props) => (
                <Button {...props} size="xs" loading={busy} disabled={!grid} style={{ background: '#0F2744', border: 'none' }}>
                  {existingRow ? 'Replace file' : 'Upload .bkt'}
                </Button>
              )}
            </FileButton>
            {existingRow && (
              <Button size="xs" variant="subtle" color="red" loading={busy} onClick={handleRemove}>Remove</Button>
            )}
          </Group>
        </Group>
        {grid && (
          <Text size="10px" c="dimmed" mt={8}>
            Grid: {grid.grid.label} · {grid.cellCount.toLocaleString()} cells · {num(grid.totalSqFt)} SF total ·{' '}
            {grid.grid.cellFt} × {grid.grid.cellFt} ft
            {grid.grid.boundary ? ' · clipped to the work boundary' : ''}
          </Text>
        )}
      </Box>

      {existingRow?.problems?.length > 0 && (
        <Alert color="yellow" variant="light" title={`${existingRow.problems.length} row(s) could not be read`}>
          <Stack gap={2}>
            {existingRow.problems.slice(0, 5).map((p) => (
              <Text key={p.line} size="10px">line {p.line}: {p.reason}</Text>
            ))}
          </Stack>
        </Alert>
      )}

      {coverage && (
        <Box style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, overflow: 'hidden' }}>
          <Group justify="space-between" align="baseline" px={16} py={8} style={{ background: 'var(--mantine-color-gray-0)', borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Text fw={600} size="sm">Coverage by layer</Text>
            <Text size="xs" c="dimmed">
              {coverage.distinctCells.toLocaleString()} distinct cells · {num(coverage.distinctSqFt)} SF
            </Text>
          </Group>
          {todayWindows.length === 0 ? (
            <Text size="xs" c="#92400E" px={16} py={10} style={{ background: '#FFFBEB' }}>
              No events on this day carry a <b>Layer</b> yet, so the buckets can&apos;t be split by lift.
              Set the layer on the Event Log&apos;s ACTIVE PLACEMENT events and this table fills in —
              the file does not need re-uploading.
            </Text>
          ) : (
            <Table withRowBorders={false} verticalSpacing={4} fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Layer</Table.Th>
                  <Table.Th ta="right">Buckets</Table.Th>
                  <Table.Th ta="right">Cells</Table.Th>
                  <Table.Th ta="right">SF</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {coverage.layers.map((l) => (
                  <Table.Tr key={l.layerId || 'none'}>
                    <Table.Td>{l.layerId ? l.layerName : <Text span size="xs" c="orange">Unattributed</Text>}</Table.Td>
                    <Table.Td ta="right">{l.bucketCount}</Table.Td>
                    <Table.Td ta="right">{l.cellCount}</Table.Td>
                    <Table.Td ta="right" fw={500}>{num(l.sqFt)}</Table.Td>
                  </Table.Tr>
                ))}
                <Table.Tr style={{ background: 'var(--mantine-color-gray-0)' }}>
                  <Table.Td fw={700}>Total (distinct area)</Table.Td>
                  <Table.Td ta="right" fw={700}>{existingRow?.bucket_count ?? 0}</Table.Td>
                  <Table.Td ta="right" fw={700}>{coverage.distinctCells}</Table.Td>
                  <Table.Td ta="right" fw={700}>{num(coverage.distinctSqFt)}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          )}
          <Text size="10px" c="dimmed" px={16} py={8} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            A cell hit by two lifts on one day counts under each, so the per-layer column can exceed the
            distinct total. Coverage is recomputed from the event log every time this loads.
            {coverage.snapped > 0 && (
              <Text span size="10px" c="orange" inherit>
                {' '}{coverage.snapped} bucket(s) fell outside every event window and were matched to the
                nearest — tighten the event times if that looks wrong.
              </Text>
            )}
            {coverage.outsideGrid > 0 && (
              <Text span size="10px" c="red" inherit>
                {' '}{coverage.outsideGrid} bucket(s) landed outside the grid entirely.
              </Text>
            )}
          </Text>
        </Box>
      )}

      <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap={12} mb={10}>
          <Box>
            <Text fw={600} size="sm">Daily progress chart</Text>
            <Text size="xs" c="dimmed" mt={2}>
              {grid?.grid.boundary ? 'Coverage is clipped to the work boundary.' : 'Cumulative through this report date.'}
              {clippedSqFt > 0 && ` ${num(clippedSqFt)} SF of cell area fell outside and was trimmed.`}
              {priorDays.length > 0 && ` ${priorDays.length} earlier day(s) shown in their lift colours.`}
            </Text>
            {passes && coverage && (
              <Text size="xs" mt={4}>
                <b>1st pass (new ground) {num(passes.firstPassSqFt)} SF</b>
                {passes.secondPassSqFt > 0
                  ? <> · 2nd pass (touch-up over an earlier day) <b>{num(passes.secondPassSqFt)} SF</b></>
                  : <> · no 2nd pass today</>}
              </Text>
            )}
          </Box>
          <Group gap={8}>
            <Button size="xs" variant="default" disabled={!coverage} onClick={handleDownloadPng}>Download PNG</Button>
            <Button
              size="xs"
              loading={saving}
              disabled={!coverage || !existingRow}
              onClick={handleSave}
              style={{ background: '#0F2744', border: 'none' }}
            >
              {existingRow?.chart_path ? 'Update saved chart' : 'Save chart to report'}
            </Button>
            {saved && <Text size="10px" tt="uppercase" c="green" fw={600}>Saved ✓</Text>}
          </Group>
        </Group>
        <Box style={{ textAlign: 'center', overflowX: 'auto' }}>
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '100%', height: 'auto',
              display: coverage ? 'inline-block' : 'none',
              border: '1px solid var(--mantine-color-gray-3)',
            }}
          />
          {!coverage && <Text size="xs" c="dimmed" py={24}>Upload the day&apos;s .bkt file and the chart appears here.</Text>}
        </Box>
        {coverage && lifts.length === 0 && (
          <Text size="10px" c="#92400E" px={10} py={6} mt={8} style={{ background: '#FFFBEB', borderRadius: 4 }}>
            Today&apos;s coverage draws in Daily Progress green either way. Set a <b>Layer</b> on the
            day&apos;s events so it takes its lift colour on tomorrow&apos;s chart.
          </Text>
        )}
        {cellFills.unrecorded > 0 && (
          <Text size="10px" c="#92400E" px={10} py={6} mt={8} style={{ background: '#FFFBEB', borderRadius: 4 }}>
            <b>{cellFills.unrecorded} cell(s) from an earlier day have no recorded lift</b>, so they are left
            unfilled rather than shown as a material nobody logged. Set the Layer on that day&apos;s
            events and they will fill in.
          </Text>
        )}
      </Box>

      {span && (
        <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
          <Text fw={600} size="sm">Shift check</Text>
          <Text size="xs" c="dimmed" mb={10}>
            What the bucket timestamps imply, to compare against the event log.
          </Text>
          <Group gap="xl">
            <Stat label="First bucket" value={span.first} />
            <Stat label="Last bucket" value={span.last} />
            <Stat label="Span" value={fmtHM(span.lastSecs - span.firstSecs)} />
          </Group>
          {gaps.length > 0 && (
            <Box mt={10}>
              <Text size="xs" c="dimmed">
                <b>{fmtHM(idleSecs)}</b> idle across {gaps.length} gap{gaps.length === 1 ? '' : 's'} of 15 min
                or more — the delay events should account for roughly this much. Leaves{' '}
                <b>{fmtHM(span.lastSecs - span.firstSecs - idleSecs)}</b> placing.
              </Text>
              <Stack gap={0} mt={4}>
                {gaps.map((g) => (
                  <Text key={g.afterClock} size="10px" c="dimmed">
                    {g.afterClock} → {g.beforeClock} · {g.minutes} min
                  </Text>
                ))}
              </Stack>
            </Box>
          )}
          <Text size="10px" c="dimmed" mt={10}>
            Machine time {fmtSecs(existingRow?.first_secs)}–{fmtSecs(existingRow?.last_secs)} · file header{' '}
            <code>{existingRow?.source_header ?? '—'}</code> (a template default, not the machine name)
          </Text>
        </Box>
      )}
    </Stack>
  )
}

function Stat({ label, value }) {
  return (
    <Box>
      <Text size="10px" c="dimmed" tt="uppercase">{label}</Text>
      <Text size="sm" fw={500}>{value}</Text>
    </Box>
  )
}
