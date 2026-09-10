import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, FileButton, Group, Stack, Table, Text } from '@mantine/core'
import { useDomainData } from '../../../hooks/useDomainData'
import { useSpreaderConfig } from '../../../hooks/useSpreaderConfig'
import { useProjectLayers } from '../../../hooks/useProjectLayers'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { useConfirmDialog } from '../../../hooks/useConfirmDialog'
import { loadAttachmentImage, loadPublicImage } from '../../../lib/dredge/imageLoaders'
import { parseStepCsv } from '../../../lib/spreader/steps'
import { assignLayers } from '../../../lib/spreader/layers'
import { computeSpreaderCoverage, computeSpreaderCoverageFromPlan, computeCoverageFromRings } from '../../../lib/spreader/coverage'
import { renderSpreaderChart } from '../../../lib/spreader/chart'
import { windowsFromActivities } from '../../../lib/placement/attribution'
import { isProductiveActivity } from '../lib/workType'
import { useSpreaderProgressSave } from './hooks/useSpreaderProgressSave'

const SPREADER_PROGRESS_DOMAIN = 'jfb_spreader_progress'
const num = (n) => Math.round(Number(n) || 0).toLocaleString()

export default function SpreaderProgressTab({ project, report, reports, equipment, selectedEquipmentId }) {
  const selected = (equipment ?? []).find((e) => e.id === selectedEquipmentId) ?? null
  const reportId = report?.id ?? null
  const reportDate = report?.report_date ?? null
  const projectId = project?.id ?? null

  const { config, loading: configLoading } = useSpreaderConfig(projectId)
  const { layers } = useProjectLayers(projectId)
  const {
    records: progressRecords, loading: progressLoading,
    create: createProgress, update: updateProgress, remove: removeProgress, reload: reloadProgress,
  } = useDomainData({ domain: SPREADER_PROGRESS_DOMAIN, system: 'core', projectId })
  const { records: activities } = useDomainData({ domain: 'jfb_daily_activities', system: 'core', projectId })

  const canvasRef = useRef(null)
  const [images, setImages] = useState({ aerial: null, logo: null, north: null })
  const [chartError, setChartError] = useState(null)
  const { busy, message: notice, error: uploadError, run: runUpload } = useAsyncAction()
  const { confirm, modal: confirmModal } = useConfirmDialog()

  const aerialFileId = config?.aerial_path ?? null

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [aerial, logo, north] = await Promise.all([
        loadAttachmentImage(aerialFileId),
        loadPublicImage('/dredge/_assets/logo.jpg'),
        loadPublicImage('/dredge/_assets/north.png'),
      ])
      if (alive) setImages({ aerial, logo, north })
    })()
    return () => { alive = false }
  }, [aerialFileId])

  const layerOrder = useMemo(
    () => [...(layers ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((l) => l.id),
    [layers],
  )
  const layerNameById = useMemo(
    () => new Map((layers ?? []).map((l) => [l.id, l.layer_name])),
    [layers],
  )
  const dateByReportId = useMemo(
    () => new Map((reports ?? []).map((r) => [r.id, r.report_date])),
    [reports],
  )

  const rowsForEquipment = useMemo(
    () => (progressRecords ?? []).filter((r) => r.equipment_id === selectedEquipmentId),
    [progressRecords, selectedEquipmentId],
  )
  const existingRow = useMemo(
    () => rowsForEquipment.find((r) => r.report_id === reportId) ?? null,
    [rowsForEquipment, reportId],
  )

  const params = useMemo(() => {
    if (!config) return null
    const n = (v, d) => (v == null ? d : Number(v))
    return {
      minStepTons: n(config.min_step_tons, 0),
      forwardThrowFt: n(config.forward_throw_ft, 28),
      crossExtraFt: n(config.cross_extra_ft, 0),
      transitionFt: n(config.transition_ft, 8),
      broadcastFt: n(config.broadcast_ft, 6),
    }
  }, [config])

  const derived = useMemo(() => {
    if (!config || !params) return null
    const boundaries = config.boundaries ?? []
    if (!boundaries.length) return null
    const steps = existingRow?.steps ?? []
    const overrideRings = existingRow?.override_rings ?? null
    if (overrideRings?.length) {
      const breakdown = computeCoverageFromRings(overrideRings, boundaries, null, params)
      return { breakdown, recordedSteps: steps.length, placedSteps: steps.length, override: true }
    }
    if (!steps.length) return null
    const windows = windowsFromActivities(
      (activities ?? []).filter((a) => a.equipment_id === selectedEquipmentId),
      layerNameById,
      isProductiveActivity,
    )
    const assigned = assignLayers(steps, windows)
    const lanes = config.planned_lanes ?? []
    const res = lanes.length
      ? computeSpreaderCoverageFromPlan(assigned, lanes, Number(config.plan_cell_len_ft ?? 6), boundaries, params)
      : computeSpreaderCoverage(assigned, boundaries, params)
    return { ...res, override: false }
  }, [config, params, existingRow, activities, selectedEquipmentId, layerNameById])

  const priorCoverage = useMemo(() => {
    if (!reportDate) return []
    const out = []
    for (const r of rowsForEquipment) {
      const d = dateByReportId.get(r.report_id)
      if (!d || d >= reportDate) continue
      for (const c of r.coverage ?? []) out.push(c)
    }
    return out
  }, [rowsForEquipment, dateByReportId, reportDate])

  const todayCoverage = useMemo(() => derived?.breakdown ?? [], [derived])
  const todaySqFt = todayCoverage.reduce((s, c) => s + (c.sqFt ?? 0), 0)
  const toDateSqFt = todaySqFt + priorCoverage.reduce((s, c) => s + (c.sqFt ?? 0), 0)

  useEffect(() => {
    if (!canvasRef.current || !config || !(config.boundaries ?? []).length) return
    setChartError(null)
    renderSpreaderChart(canvasRef.current, {
      aerialImage: images.aerial,
      aerialGeoref: config.aerial_georef ?? null,
      boundaries: config.boundaries ?? [],
      todayCoverage,
      priorCoverage,
      layerOrder,
      projectTitle: project?.name ?? '',
      projectNumber: String(project?.project_code ?? ''),
      areaLabel: (config.boundaries ?? []).map((b) => b.area).join(' / '),
      spreaderName: config.spreader_name ?? selected?.name ?? '',
      layerTitle: config.layer_title ?? '',
      notes: '',
      dateISO: reportDate ?? '',
      logoImage: images.logo,
      northImage: images.north,
    }).catch((e) => setChartError(e.message))
  }, [config, images, todayCoverage, priorCoverage, layerOrder, project, selected, reportDate])

  const { saving, saved, saveError, resetSaveState, handleSave } = useSpreaderProgressSave({
    report, selected, existingRow, updateProgress, reloadProgress, canvasRef,
  })

  const handleUpload = (file) => {
    if (!file) return
    resetSaveState()
    runUpload(async () => {
      const text = await file.text()
      const steps = parseStepCsv(text)
      if (!steps.length) throw new Error('No step rows were read from that file.')
      const payload = {
        project_id: projectId,
        report_id: reportId,
        equipment_id: selectedEquipmentId,
        source_filename: file.name,
        steps,
      }
      if (existingRow?.id) await updateProgress(existingRow.id, payload)
      else await createProgress(payload)
      await reloadProgress()
      return `Read ${steps.length} step${steps.length === 1 ? '' : 's'} from ${file.name}.`
    })
  }

  const handleBank = async () => {
    if (!existingRow?.id) return
    await updateProgress(existingRow.id, {
      coverage: todayCoverage,
      today_sqft: todaySqFt,
      cumulative_sqft: toDateSqFt,
    })
    await reloadProgress()
  }

  const handleDelete = async () => {
    if (!existingRow?.id) return
    if (!(await confirm("Delete this day's spreader log?"))) return
    await removeProgress(existingRow.id)
    await reloadProgress()
  }

  if (configLoading || progressLoading) return <Text size="sm" c="dimmed" p={16}>Loading…</Text>

  if (!config || !(config.boundaries ?? []).length) {
    return (
      <Alert color="blue" title="Spreader chart not set up yet">
        <Text size="sm">
          This project is flagged as a spreader job, but its subarea boundaries have not been
          uploaded. Add them under <strong>Project Settings → Spreader Chart</strong>; coverage is
          hard-clipped to those boundaries, so nothing can be charted until they exist.
        </Text>
      </Alert>
    )
  }

  return (
    <Stack gap={12}>
      <Group gap={10} align="center" wrap="wrap">
        <FileButton onChange={handleUpload} accept=".csv,text/csv">
          {(props) => (
            <Button {...props} size="xs" loading={busy} style={{ background: '#0F2744', border: 'none' }}>
              {existingRow ? 'Replace Step Detail file' : 'Upload Step Detail file'}
            </Button>
          )}
        </FileButton>
        {existingRow && (
          <>
            <Button size="xs" variant="default" onClick={handleBank} disabled={!derived}>Bank coverage</Button>
            <Button size="xs" variant="default" loading={saving} onClick={handleSave}>Save chart to report</Button>
            <Button size="xs" variant="subtle" color="red" onClick={handleDelete}>Delete</Button>
          </>
        )}
        {existingRow?.source_filename && (
          <Text size="xs" c="dimmed">
            {existingRow.source_filename} · {(existingRow.steps ?? []).length} steps
          </Text>
        )}
      </Group>

      {notice && <Text size="xs" c="teal">{notice}</Text>}
      {uploadError && <Text size="xs" c="red">{uploadError}</Text>}
      {saveError && <Text size="xs" c="red">{saveError}</Text>}
      {saved && <Text size="xs" c="teal">Chart saved to the report.</Text>}
      {chartError && <Text size="xs" c="red">{chartError}</Text>}

      {derived && (
        <Text size="sm">
          Today: <strong>{num(todaySqFt)} SF</strong> · To date: <strong>{num(toDateSqFt)} SF</strong>
          {!derived.override && (
            <> · {derived.placedSteps} of {derived.recordedSteps} steps placed material
              {derived.recordedSteps > derived.placedSteps
                ? `; ${derived.recordedSteps - derived.placedSteps} walk-back excluded`
                : ''}
            </>
          )}
          {derived.override && <> · from the PM&apos;s drawn coverage override</>}
        </Text>
      )}

      {todayCoverage.length > 0 && (
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Subarea</Table.Th>
              <Table.Th>Lift</Table.Th>
              <Table.Th ta="right">SF today</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {todayCoverage.map((c) => (
              <Table.Tr key={`${c.area}-${c.layerId ?? 'none'}`}>
                <Table.Td>{c.area}</Table.Td>
                <Table.Td>{c.layerId ? (layerNameById.get(c.layerId) ?? '—') : <Text span c="orange.8">Unattributed</Text>}</Table.Td>
                <Table.Td ta="right">{num(c.sqFt)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {!existingRow && (
        <Text size="xs" c="dimmed">
          Upload the spreader&apos;s Step Detail export for this day to derive coverage.
        </Text>
      )}

      <Box style={{ overflowX: 'auto' }}>
        <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 1060, border: '1px solid #ddd' }} />
      </Box>

      {confirmModal}
    </Stack>
  )
}
