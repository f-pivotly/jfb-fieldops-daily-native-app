import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, FileButton, Group, Stack, Text } from '@mantine/core'
import { useDomainData } from '../../../hooks/core/useDomainData'
import { useSpreaderConfig } from '../../../hooks/spreader/useSpreaderConfig'
import { useProjectLayers } from '../../../hooks/capping/useProjectLayers'
import { useAsyncAction } from '../../../hooks/ui/useAsyncAction'
import { loadAttachmentImage, loadPublicImage } from '../../../lib/dredge/imageLoaders'
import { parseStepCsv } from '../../../lib/spreader/steps'
import { assignLayers } from '../../../lib/spreader/layers'
import { computeSpreaderCoverage, computeSpreaderCoverageFromPlan, computeCoverageFromRings } from '../../../lib/spreader/coverage'
import { renderSpreaderChart } from '../../../lib/spreader/chart'
import { parseDxfPolylines } from '../../../lib/dredge/chart'
import { windowsFromActivities } from '../../../lib/placement/attribution'
import { isProductiveActivity } from '../lib/workType'
import { useSpreaderProgressSave } from '../../../hooks/spreader/useSpreaderProgressSave'
import { useDayActivities } from '../../../hooks/production/useDayActivities'

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
    create: createProgress, update: updateProgress, reload: reloadProgress,
  } = useDomainData({ domain: SPREADER_PROGRESS_DOMAIN, system: 'core', projectId })
  const activities = useDayActivities({ projectId, reportDate, equipmentId: selectedEquipmentId })

  const canvasRef = useRef(null)
  const [images, setImages] = useState({ aerial: null, logo: null, north: null })
  const [chartError, setChartError] = useState(null)
  const { busy, message: notice, error: uploadError, run: runUpload } = useAsyncAction()

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

  // Shared by the live preview (derived, below) and every action that
  // persists a row (upload / override / clear) -- each of those banks its
  // own freshly-computed breakdown immediately as part of the same save,
  // rather than leaving that as a separate manual step. Takes steps/rings
  // directly (not existingRow) so a handler can compute from data it just
  // parsed, before that data has round-tripped back through a reload.
  function computeBreakdown(steps, overrideRings) {
    const boundaries = config.boundaries ?? []
    if (overrideRings?.length) {
      const breakdown = computeCoverageFromRings(overrideRings, boundaries, null, params)
      return { breakdown, recordedSteps: steps.length, placedSteps: steps.length, override: true }
    }
    if (!steps.length) return { breakdown: [], recordedSteps: 0, placedSteps: 0, override: false }
    const windows = windowsFromActivities(activities ?? [], layerNameById, isProductiveActivity)
    const assigned = assignLayers(steps, windows)
    const lanes = config.planned_lanes ?? []
    const res = lanes.length
      ? computeSpreaderCoverageFromPlan(assigned, lanes, Number(config.plan_cell_len_ft ?? 6), boundaries, params)
      : computeSpreaderCoverage(assigned, boundaries, params)
    return { ...res, override: false }
  }

  const derived = useMemo(() => {
    if (!config || !params) return null
    if (!(config.boundaries ?? []).length) return null
    const steps = existingRow?.steps ?? []
    const overrideRings = existingRow?.override_rings ?? null
    if (!steps.length && !overrideRings?.length) return null
    return computeBreakdown(steps, overrideRings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Every action below computes its own resulting breakdown and banks it
  // (coverage/today_sqft/cumulative_sqft) as part of the same save --
  // matching the non-native app's single "Save" action, which persists
  // steps and the currently-computed coverage together. Native has no
  // separate "Bank coverage" step; each of these IS that step.
  function bankedFields(steps, overrideRings) {
    const result = computeBreakdown(steps, overrideRings)
    const todaySqFtNow = result.breakdown.reduce((s, c) => s + (c.sqFt ?? 0), 0)
    const cumulativeSqFtNow = todaySqFtNow + priorCoverage.reduce((s, c) => s + (c.sqFt ?? 0), 0)
    return { coverage: result.breakdown, today_sqft: todaySqFtNow, cumulative_sqft: cumulativeSqFtNow }
  }

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
        ...bankedFields(steps, null),
      }
      if (existingRow?.id) await updateProgress(existingRow.id, payload)
      else await createProgress(payload)
      await reloadProgress()
      return `Read ${steps.length} step${steps.length === 1 ? '' : 's'} from ${file.name}.`
    })
  }

  const handleUploadOverride = (file) => {
    if (!file) return
    resetSaveState()
    runUpload(async () => {
      const text = await file.text()
      const rings = parseDxfPolylines(text)
      if (!rings.length) throw new Error('No closed polygon found in that DXF.')
      const payload = {
        project_id: projectId,
        report_id: reportId,
        equipment_id: selectedEquipmentId,
        override_rings: rings,
        ...bankedFields(existingRow?.steps ?? [], rings),
      }
      if (existingRow?.id) await updateProgress(existingRow.id, payload)
      else await createProgress(payload)
      await reloadProgress()
      return `Coverage override loaded (${rings.length} polygon${rings.length === 1 ? '' : 's'}) — applied.`
    })
  }

  const handleClearOverride = () => {
    if (!existingRow?.id) return
    resetSaveState()
    runUpload(async () => {
      const steps = existingRow?.steps ?? []
      await updateProgress(existingRow.id, { override_rings: null, ...bankedFields(steps, null) })
      await reloadProgress()
      return 'Override cleared — back to step-derived coverage.'
    })
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
              Upload Step Detail (CSV)
            </Button>
          )}
        </FileButton>
        <Text size="xs" c="dimmed">Neenah &quot;Step Detail&quot; export, saved as CSV</Text>
        <FileButton onChange={handleUploadOverride} accept=".dxf,application/dxf">
          {(props) => (
            <Button {...props} size="xs" variant="outline" color="orange" loading={busy}>
              Coverage override (DXF)
            </Button>
          )}
        </FileButton>
        {!!existingRow?.override_rings?.length && (
          <Text size="xs" c="dimmed" onClick={handleClearOverride} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
            clear
          </Text>
        )}
        {existingRow && (
          <Button size="xs" variant="default" loading={saving} onClick={handleSave}>Save chart to report</Button>
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
              {params?.minStepTons > 0 ? ` (≥ ${params.minStepTons} t)` : ''}
              {derived.recordedSteps > derived.placedSteps
                ? `; ${derived.recordedSteps - derived.placedSteps} walk-back excluded`
                : ''}
            </>
          )}
          {derived.override && <> · from the PM&apos;s drawn coverage override</>}
        </Text>
      )}

      {!existingRow && (
        <Text size="xs" c="dimmed">
          Upload the spreader&apos;s Step Detail export for this day to derive coverage.
        </Text>
      )}

      <Box style={{ overflowX: 'auto' }}>
        <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 1060, border: '1px solid #ddd' }} />
      </Box>
    </Stack>
  )
}
