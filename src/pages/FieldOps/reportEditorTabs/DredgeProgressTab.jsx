import { useRef, useState } from 'react'
import { Box, Button, FileButton, Group, NumberInput, Stack, Text, TextInput } from '@mantine/core'
import { useDomainData } from '../../../hooks/useDomainData'
import { useProjectAreas } from '../../../hooks/useProjectAreas'
import { useDredgeEquipmentConfig } from '../../../hooks/useDredgeEquipmentConfig'
import { useAppConfig } from '../../../contexts/appConfigContext'
import { downloadAttachment, uploadAttachment } from '../../../data'
import { readTrack } from '../../../lib/dredge/coverage'
import { renderChart, buildProgressDxfFromRings, parseDredge, parseCells, parseReferenceLines } from '../../../lib/dredge/chart'
import { decodeRefSurface, gunzipBytes, impliedThicknessFt } from '../../../lib/dredge/designVolume'
import { loadAttachmentImage, loadPublicImage, loadTiles } from '../../../lib/dredge/imageLoaders'
import { parseTrackDxf, looksLikeTrack, trackCoverage, TRACK_DEFAULTS } from '../../../lib/dredge/track'
import { parseEarthworksCsv, coverageFromSurface } from '../../../lib/dredge/earthworks'

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// Downloads + gunzips + decodes the project's reference-survey grid, caching
// it in refSurfaceRef by storage path so a re-generate doesn't re-fetch it.
async function loadRefSurface(path, refSurfaceRef) {
  if (!path) return null
  if (refSurfaceRef.current?.path === path) return refSurfaceRef.current.surface
  const blob = await downloadAttachment(path)
  const surface = decodeRefSurface(await gunzipBytes(blob))
  refSurfaceRef.current = { path, surface }
  return surface
}

// Which end of the shape is the bucket is a fixed property of the uploaded
// DXF, not something that changes day to day -- remembered per equipment in
// localStorage (matching the source app) rather than in the domain.
function readFlipShape(equipmentId) {
  try { return equipmentId ? localStorage.getItem(`dredgeFlip:${equipmentId}`) === '1' : false } catch { return false }
}

// Downloads + parses the equipment's dredge-shape DXF, caching it in
// dredgeShapeRef by storage path so a re-generate doesn't re-fetch it.
async function loadDredgeShape(path, dredgeShapeRef) {
  if (!path) return null
  if (dredgeShapeRef.current?.path === path) return dredgeShapeRef.current.shape
  const blob = await downloadAttachment(path)
  const shape = parseDredge(await blob.text())
  dredgeShapeRef.current = { path, shape }
  return shape
}

// Downloads + parses the project's CSC / cell-grid DXF, caching it in
// cellsRef by storage path so a re-generate doesn't re-fetch it.
async function loadCells(path, cellsRef) {
  if (!path) return []
  if (cellsRef.current?.path === path) return cellsRef.current.cells
  const blob = await downloadAttachment(path)
  const cells = parseCells(await blob.text())
  cellsRef.current = { path, cells }
  return cells
}

// Downloads + parses the project's mile-marker/stationing DXF, caching it in
// referenceLinesRef by storage path so a re-generate doesn't re-fetch it.
async function loadReferenceLines(path, referenceLinesRef) {
  const empty = { segments: [], labels: [] }
  if (!path) return empty
  if (referenceLinesRef.current?.path === path) return referenceLinesRef.current.lines
  const blob = await downloadAttachment(path)
  const lines = parseReferenceLines(await blob.text())
  referenceLinesRef.current = { path, lines }
  return lines
}

// Resolves the day's coverage from whatever the project's data source is.
// HYPACK (hydraulic): a point track, read from the RAW folder. Earthworks
// (mechanical): a Tracking DXF (primary -- the machine's own bucket-position
// log) and/or a surface CSV, reduced to coverage RINGS by track.js/
// earthworks.js instead of a point track. Ported from the reference's
// generateFromTrack/generateFromEarthworks, minus the hard-structure
// alignment snap (alignment.ts -- a separate, still-unbuilt gap) and minus
// full-surface day-over-day diffing (needs somewhere to bank each day's
// surface for tomorrow -- jfb_dredge_progress has no field for that yet).
async function resolveTodayCoverage(cfg, pickedFiles) {
  if (cfg.data_source !== 'earthworks') {
    const track = await readTrack(pickedFiles)
    return { pts: track.pts, headings: track.headings, todayCoverageRings: [], notice: '' }
  }
  if (cfg.water_elev_ft == null) {
    throw new Error('Water elevation is not set for this project -- a PM/Admin can add it under Project Settings -> Dredge Chart.')
  }
  const dxfFile = pickedFiles.find((f) => /\.dxf$/i.test(f.name)) ?? null
  const csvFile = pickedFiles.find((f) => /\.(csv|asc|txt)$/i.test(f.name)) ?? null
  if (dxfFile) {
    const cycles = parseTrackDxf(await dxfFile.text())
    if (!cycles.length) throw new Error('No machine track found in that DXF. Is it the daily Tracking export?')
    if (!looksLikeTrack(cycles)) {
      throw new Error(`That DXF looks like a drawn progress border (${cycles.length} shapes), not a machine track. Import it under Project Settings -> Dredge Chart -> Prior coverage baseline instead.`)
    }
    const bed = csvFile ? parseEarthworksCsv(await csvFile.text()) : null
    const cov = trackCoverage(cycles, {
      bucketWidthFt: cfg.bucket_width_ft ?? TRACK_DEFAULTS.bucketWidthFt,
      bedTolFt: cfg.track_bed_tolerance_ft ?? TRACK_DEFAULTS.bedTolFt,
      bed,
      maxDigElev: bed ? null : Number(cfg.water_elev_ft),
    })
    if (!cov.rings.length) {
      throw new Error(`No digging found in the track (${cov.cycles} cycles, ${cov.travelVertices} travel positions). If the bucket did dig, the bed tolerance may be too tight -- a PM can adjust it in Project Settings.`)
    }
    const notice = `Border from the machine track: ${cov.cycles} bucket cycles, ${cov.digVertices} digging positions (${cov.travelVertices} travel/swing positions ignored).`
      + (bed ? ' Volume needs a banked prior-day surface, not yet supported.' : ' No surface CSV uploaded, so no volume this time.')
    return { pts: [], headings: [], todayCoverageRings: cov.rings, notice }
  }
  if (csvFile) {
    const today = parseEarthworksCsv(await csvFile.text())
    let design = null
    if (cfg.design_path) {
      try { design = parseEarthworksCsv(await (await downloadAttachment(cfg.design_path)).text()) } catch { /* optional */ }
    }
    const cov = coverageFromSurface(today, { waterElev: Number(cfg.water_elev_ft), design })
    if (!cov.rings.length) {
      throw new Error(`No dredging found in this export (${cov.swingFilteredSqFt.toLocaleString()} sq ft of swing/dump readings were filtered out).`)
    }
    const notice = `Border from the day's surface export (${cov.keptSqFt.toLocaleString()} sq ft kept, ${cov.swingFilteredSqFt.toLocaleString()} sq ft of swing/dump readings filtered). Volume needs a banked prior-day surface, not yet supported.`
    return { pts: [], headings: [], todayCoverageRings: cov.rings, notice }
  }
  throw new Error('Choose the day’s Tracking .dxf and/or the surface .csv.')
}

const DEFAULT_GAP = 5, DEFAULT_TOL = 5

const MODE_HINTS = {
  'add-second': (n) => `Click to outline a 2nd-pass area (${n} point${n === 1 ? '' : 's'}), then Done.`,
  'remove-second': () => 'Click a proposed 2nd-pass (olive) area to reject it back to incidental.',
  'remove-area': () => 'Click any coverage patch that is NOT real dredging -- the whole connected patch is removed. Click each patch to remove; Remove area again to finish.',
  exclude: (n) => `Outline area to EXCLUDE from coverage (${n} point${n === 1 ? '' : 's'}), then Done.`,
  advance: (n) => `Click down the CENTER of the dredge lane (${n} point${n === 1 ? '' : 's'}), then Done. One line per lane -- repeat for each lane; lengths add up.`,
  'place-cutter': () => 'Click where the cutter/bucket is right now.',
  'place-stern': () => 'Now click the stern/tail end, to set the heading.',
}

function ModeBtn({ active, onClick, children }) {
  return (
    <Button size="xs" variant={active ? 'filled' : 'default'} onClick={onClick}>
      {children}
    </Button>
  )
}

export default function DredgeProgressTab({ project, report, reports, equipment, selectedEquipmentId }) {
  const [files, setFiles] = useState([])
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [mode, setMode] = useState('view')
  const [gapFt, setGapFt] = useState(DEFAULT_GAP)
  const [tolFt, setTolFt] = useState(DEFAULT_TOL)
  const [drawCount, setDrawCount] = useState(0)
  const [manualCount, setManualCount] = useState(0)
  const [removedCount, setRemovedCount] = useState(0)
  const [excludeCount, setExcludeCount] = useState(0)
  const [removedAreaCount, setRemovedAreaCount] = useState(0)
  const [advanceCount, setAdvanceCount] = useState(0)
  // Start/end station entry (stationed river/channel projects).
  const [stationFrom, setStationFrom] = useState('')
  const [stationTo, setStationTo] = useState('')
  const [recovery, setRecovery] = useState('')
  const [refSurfaceError, setRefSurfaceError] = useState('')
  const [hasOverride, setHasOverride] = useState(false)
  // Display-only mirror of editRef.current.flipShape (the ref is what
  // runRender() actually reads, same "ref = data, state = re-render trigger"
  // pattern as hasOverride/manualCount/etc. above) -- avoids a stale-closure
  // read if runRender() were called right after a setState toggle.
  const [flipDisplay, setFlipDisplay] = useState(() => readFlipShape(selectedEquipmentId))

  const canvasRef = useRef(null)
  const transformRef = useRef(null)
  const todayPtsRef = useRef([])
  const headingsRef = useRef([])
  // Mechanical/Earthworks coverage rings (see resolveTodayCoverage) -- empty
  // for HYPACK projects, where todayPtsRef drives coverage instead.
  const todayCoverageRingsRef = useRef([])
  const drawRef = useRef([])
  const editRef = useRef({ secondManual: [], removedSeeds: [], excludeRings: [], removedAreaSeeds: [], advanceLines: [], override: null, flipShape: flipDisplay })
  const imagesRef = useRef({})
  // Caches the decoded reference-survey grid by storage path, so re-generating
  // a chart doesn't re-download/re-gunzip the ~MB grid every time -- only when
  // the config's reference_surface_path actually changes.
  const refSurfaceRef = useRef(null)
  // Same idea, for the parsed dredge-shape DXF.
  const dredgeShapeRef = useRef(null)
  // Same idea, for the parsed CSC / cell-grid DXF.
  const cellsRef = useRef(null)
  // Same idea, for the parsed mile-marker/stationing DXF.
  const referenceLinesRef = useRef(null)
  const pendingCutterRef = useRef(null)

  const selected = equipment.find((e) => e.id === selectedEquipmentId)
  const { config } = useAppConfig()

  const { records: dredgeConfigRecords, loading: configLoading } =
    useDomainData({ domain: 'jfb_dredge_config', system: 'core', projectId: project?.id })
  const { records: progressRecords, loading: progressLoading, create: createProgress, update: updateProgress, reload: reloadProgress } =
    useDomainData({ domain: 'jfb_dredge_progress', system: 'core', projectId: project?.id })
  const { areas } = useProjectAreas(project?.id)
  const areaNameById = new Map((areas ?? []).map((a) => [a.id, a.name]))
  const { equipmentConfigs } = useDredgeEquipmentConfig(project?.id)
  const equipmentConfig = (equipmentConfigs ?? []).find((c) => c.equipment_id === selectedEquipmentId) ?? null

  const effectiveConfig = dredgeConfigRecords[0] ?? null

  // Derived, not synced via an effect: `recovery` only tracks an explicit PE
  // override; until they type one, the field displays (and generate uses)
  // the project's saved default -- same value either way, just not copied
  // into state that could drift from it.
  const displayedRecovery = recovery !== '' ? recovery : (effectiveConfig?.volume_recovery_factor ?? '')

  if (configLoading) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Loading dredge chart configuration…</Text>
  }

  if (!effectiveConfig) {
    return (
      <Box
        p={32}
        style={{
          border: '1px dashed var(--mantine-color-gray-4)',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <Text size="sm" c="dimmed">
          This dredge isn't configured for charts yet. A PM/Admin can set it up under{' '}
          <Text span fw={500} c="dimmed" inherit>Project Settings → Dredge Chart</Text>{' '}
          (background, georeference, and the dredge shape).
        </Text>
      </Box>
    )
  }

  const reportDateById = new Map((reports ?? []).map((r) => [r.id, r.report_date]))
  const priorProgressRows = (progressRecords ?? []).filter((row) => {
    if (row.equipment_id !== selected?.id) return false
    const rowDate = reportDateById.get(row.report_id)
    return !!rowDate && !!report?.report_date && rowDate < report.report_date
  })
  const priorRings = priorProgressRows.flatMap((row) => row.footprint_rings ?? row.coverage_rings ?? [])
  const existingProgressRecord = (progressRecords ?? []).find(
    (row) => row.report_id === report?.id && row.equipment_id === selected?.id,
  )

  const runRender = () => {
    const cfg = effectiveConfig
    const e = editRef.current
    const refSurface = (cfg.reference_surface_path && refSurfaceRef.current?.path === cfg.reference_surface_path)
      ? refSurfaceRef.current.surface
      : null
    const volume = (cfg.volume_mode === 'design_grade' && refSurface && cfg.design_elev_ft != null)
      ? {
          mode: 'design-grade',
          ref: refSurface,
          designElev: Number(cfg.design_elev_ft),
          recoveryFactor: recovery.trim() !== '' ? Number(recovery) : (cfg.volume_recovery_factor ?? 0.75),
        }
      : undefined
    const dredgeShape = (equipmentConfig?.shape_path && dredgeShapeRef.current?.path === equipmentConfig.shape_path)
      ? dredgeShapeRef.current.shape
      : null
    const result = renderChart(canvasRef.current, {
      todayPts: todayPtsRef.current,
      headings: headingsRef.current,
      todayCoverageRings: todayCoverageRingsRef.current,
      dateISO: report.report_date,
      config: {
        projectTitle: cfg.chart_title_override || project.name,
        area: areaNameById.get(cfg.default_area_id) || '',
        stationText: cfg.require_stations && stationFrom.trim() && stationTo.trim()
          ? `${stationFrom.trim()} to ${stationTo.trim()}` : undefined,
        materials: cfg.default_material_note || '',
        dredgeLabel: equipmentConfig?.chart_label_override || selected?.name || 'Dredge',
        ...imagesRef.current,
      },
      priorRings,
      gapFt,
      overlapTolFt: tolFt,
      excludeRings: e.excludeRings,
      removedAreaSeeds: e.removedAreaSeeds,
      secondPassRings: e.secondManual,
      removedSeeds: e.removedSeeds,
      advanceLines: e.advanceLines,
      volume,
      dredgeShape,
      override: e.override,
      flipShape: e.flipShape,
    })
    transformRef.current = result.transform
    setLastResult({ ...result, trackPoints: todayPtsRef.current.length })
    return result
  }

  const handleFilesChange = (newFiles) => {
    setFiles(newFiles)
    setGenerated(false)
    setLastResult(null)
    setError(null)
    setNotice('')
    setSaved(false)
    setSaveError(null)
    const flip = readFlipShape(selectedEquipmentId)
    editRef.current = { secondManual: [], removedSeeds: [], excludeRings: [], removedAreaSeeds: [], advanceLines: [], override: null, flipShape: flip }
    pendingCutterRef.current = null
    drawRef.current = []
    setMode('view'); setDrawCount(0); setManualCount(0); setRemovedCount(0); setExcludeCount(0); setRemovedAreaCount(0); setAdvanceCount(0); setHasOverride(false); setFlipDisplay(flip)
    setGapFt(DEFAULT_GAP); setTolFt(DEFAULT_TOL)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    setNotice('')
    setSaved(false)
    setRefSurfaceError('')
    try {
      const cfg = effectiveConfig
      const needsRefSurface = cfg.volume_mode === 'design_grade' && !!cfg.reference_surface_path
      const [today, bgImage, colorbarImage, aerialImage, northImage, logoImage, isopachTiles, aerialTiles, cells, referenceLines] = await Promise.all([
        resolveTodayCoverage(cfg, files),
        loadAttachmentImage(cfg.bg_path),
        loadAttachmentImage(cfg.colorbar_path),
        loadAttachmentImage(cfg.aerial_path),
        loadPublicImage('/dredge/_assets/north.png'),
        loadPublicImage('/dredge/_assets/logo.jpg'),
        loadTiles(cfg.isopach_tiles),
        loadTiles(cfg.aerial_tiles),
        // Missing/unreadable cells DXF just means no overlay draws.
        cfg.cells_path
          ? loadCells(cfg.cells_path, cellsRef).catch(() => [])
          : Promise.resolve([]),
        // Missing/unreadable reference-lines DXF just means no overlay draws.
        cfg.reference_lines_path
          ? loadReferenceLines(cfg.reference_lines_path, referenceLinesRef).catch(() => ({ segments: [], labels: [] }))
          : Promise.resolve({ segments: [], labels: [] }),
        // Missing/unreadable reference survey shouldn't block coverage from
        // rendering -- just skip the CY calc and surface a warning instead.
        needsRefSurface
          ? loadRefSurface(cfg.reference_surface_path, refSurfaceRef).catch((err) => {
              setRefSurfaceError(err.message)
              return null
            })
          : Promise.resolve(null),
        // A missing/unreadable shape file just means no icon draws -- same
        // silent-degrade behavior as the source app.
        equipmentConfig?.shape_path
          ? loadDredgeShape(equipmentConfig.shape_path, dredgeShapeRef).catch(() => null)
          : Promise.resolve(null),
      ])
      todayPtsRef.current = today.pts
      headingsRef.current = today.headings
      todayCoverageRingsRef.current = today.todayCoverageRings
      if (today.notice) setNotice(today.notice)
      imagesRef.current = {
        bgImage, bgGeoref: cfg.georef ?? null,
        aerialImage, aerialGeoref: cfg.aerial_georef ?? null,
        colorbarImage, northImage, logoImage,
        isopachTiles, aerialTiles,
        cells, referenceLines,
      }
      // flipShape is a sticky per-equipment property (see readFlipShape), not
      // a per-generate edit -- preserved across this reset, unlike everything
      // else here.
      editRef.current = { secondManual: [], removedSeeds: [], excludeRings: [], removedAreaSeeds: [], advanceLines: [], override: null, flipShape: editRef.current.flipShape }
      pendingCutterRef.current = null
      drawRef.current = []
      setMode('view'); setDrawCount(0); setManualCount(0); setRemovedCount(0); setExcludeCount(0); setRemovedAreaCount(0); setAdvanceCount(0); setHasOverride(false)
      runRender()
      setGenerated(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const recordData = {
        project_id: project.id,
        report_id: report.id,
        equipment_id: selected.id,
        coverage_rings: lastResult.todayRings,
        footprint_rings: lastResult.footprintRings,
        second_pass_flags: lastResult.secondRings.length ? lastResult.secondRings : null,
        advance_ft: lastResult.stats.advanceFt,
        advance_lines: lastResult.advanceLines.length ? lastResult.advanceLines : null,
        today_sqft: lastResult.stats.todaySqFt,
        cumulative_sqft: lastResult.stats.cumulativeSqFt,
        gross_cy: lastResult.stats.grossCy ?? null,
        adjusted_cy: lastResult.stats.adjustedCy ?? null,
        placement_override: editRef.current.override ?? null,
        generated_by_user_id: config?.user?.id ?? null,
      }
      let progressId
      if (existingProgressRecord) {
        await updateProgress(existingProgressRecord.id, recordData)
        progressId = existingProgressRecord.id
      } else {
        const res = await createProgress(recordData)
        progressId = res?.data?.id
      }

      // Upload the rendered chart to Pivotly file storage and record its
      // path -- same uploadAttachment() flow every other dredge file already
      // uses (DredgeChartTab.jsx's images/DXFs, the equipment shape). The
      // canvas itself is never persisted, only this PNG export of it.
      // Needs an existing record id first, same "save row, then attach"
      // ordering used everywhere else in this feature.
      if (progressId) {
        const blob = await new Promise((res) => canvasRef.current?.toBlob(res, 'image/png'))
        if (!blob) throw new Error('Could not export the chart image.')
        const file = new File([blob], `dredge_progress_${report.report_date}.png`, { type: 'image/png' })
        const uploadRes = await uploadAttachment({ coreRecordId: progressId, domain: 'jfb_dredge_progress', file })
        await updateProgress(progressId, { chart_path: uploadRes.fileId })
      }

      await reloadProgress()
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadDxf = () => {
    if (!lastResult) return
    const dxf = buildProgressDxfFromRings(lastResult.todayRings, lastResult.secondRings)
    triggerDownload(new Blob([dxf], { type: 'application/dxf' }), `progress_${report.report_date}.dxf`)
  }
  const handleDownloadPng = () => {
    canvasRef.current?.toBlob((b) => { if (b) triggerDownload(b, `dredge_progress_${report.report_date}.png`) }, 'image/png')
  }

  const clientToWorld = (clientX, clientY) => {
    const cv = canvasRef.current, t = transformRef.current
    if (!cv || !t) return null
    const r = cv.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || t.sc === 0) return null
    const px = (clientX - r.left) * (cv.width / r.width), py = (clientY - r.top) * (cv.height / r.height)
    const wx = t.minX + (px - t.ox) / t.sc, wy = t.minY + (t.oy + t.mapH - py) / t.sc
    return (isFinite(wx) && isFinite(wy)) ? [wx, wy] : null
  }

  const drawPendingMarkers = () => {
    const cv = canvasRef.current, t = transformRef.current
    if (!cv || !t) return
    const g = cv.getContext('2d')
    const sx = (x) => t.ox + (x - t.minX) * t.sc, sy = (y) => t.oy + t.mapH - (y - t.minY) * t.sc
    const pts = drawRef.current
    if (!pts.length) return
    g.strokeStyle = '#7a7a17'; g.fillStyle = 'rgba(138,138,42,0.25)'; g.lineWidth = 2
    g.beginPath(); g.moveTo(sx(pts[0][0]), sy(pts[0][1])); for (const p of pts.slice(1)) g.lineTo(sx(p[0]), sy(p[1])); g.stroke()
    for (const p of pts) { g.beginPath(); g.arc(sx(p[0]), sy(p[1]), 3, 0, 7); g.fill() }
  }

  const handleCanvasClick = (ev) => {
    if (mode === 'view') return
    const w = clientToWorld(ev.clientX, ev.clientY)
    if (!w) return
    if (mode === 'place-cutter') {
      pendingCutterRef.current = w; setMode('place-stern')
    } else if (mode === 'place-stern') {
      const cutter = pendingCutterRef.current
      if (!cutter) { setMode('place-cutter'); return }
      editRef.current.override = { cutter, stern: w }; pendingCutterRef.current = null
      setHasOverride(true); setMode('view'); runRender()
    } else if (mode === 'add-second' || mode === 'exclude' || mode === 'advance') {
      drawRef.current.push(w); setDrawCount(drawRef.current.length); drawPendingMarkers()
    } else if (mode === 'remove-second') {
      editRef.current.removedSeeds.push(w); setRemovedCount(editRef.current.removedSeeds.length); runRender()
    } else if (mode === 'remove-area') {
      editRef.current.removedAreaSeeds.push(w); setRemovedAreaCount(editRef.current.removedAreaSeeds.length); runRender()
    }
  }

  const finishDrawing = () => {
    if (mode === 'advance') {
      if (drawRef.current.length >= 2) { editRef.current.advanceLines = [...editRef.current.advanceLines, [...drawRef.current]]; setAdvanceCount(editRef.current.advanceLines.length) }
    } else if (drawRef.current.length >= 3) {
      if (mode === 'exclude') { editRef.current.excludeRings = [...editRef.current.excludeRings, [...drawRef.current]]; setExcludeCount(editRef.current.excludeRings.length) }
      else { editRef.current.secondManual = [...editRef.current.secondManual, [...drawRef.current]]; setManualCount(editRef.current.secondManual.length) }
    }
    drawRef.current = []; setDrawCount(0); setMode('view'); runRender()
  }

  const toggleMode = (next) => () => {
    drawRef.current = []; setDrawCount(0)
    setMode((m) => (m === next ? 'view' : next))
  }
  const clearExclude = () => { editRef.current.excludeRings = []; setExcludeCount(0); drawRef.current = []; setDrawCount(0); runRender() }
  const clearRemovedAreas = () => { editRef.current.removedAreaSeeds = []; setRemovedAreaCount(0); runRender() }
  const undoLastRemovedArea = () => { editRef.current.removedAreaSeeds.pop(); setRemovedAreaCount(editRef.current.removedAreaSeeds.length); runRender() }
  const clearAdvance = () => { editRef.current.advanceLines = []; setAdvanceCount(0); drawRef.current = []; setDrawCount(0); runRender() }
  const clearSecondEdits = () => { editRef.current.secondManual = []; editRef.current.removedSeeds = []; setManualCount(0); setRemovedCount(0); drawRef.current = []; setDrawCount(0); runRender() }
  const applyGap = () => runRender()
  const applyTol = () => runRender()
  const resetPlacement = () => { editRef.current.override = null; setHasOverride(false); runRender() }
  const toggleFlip = () => {
    const next = !editRef.current.flipShape
    editRef.current.flipShape = next
    try { if (selectedEquipmentId) localStorage.setItem(`dredgeFlip:${selectedEquipmentId}`, next ? '1' : '0') } catch { /* private mode */ }
    setFlipDisplay(next)
    runRender()
  }

  const stationsMissing = !!effectiveConfig?.require_stations && (!stationFrom.trim() || !stationTo.trim())
  const canGenerate = files.length > 0 && !!report?.report_date && !!selected && !progressLoading && !generating && !stationsMissing
  const editing = mode !== 'view'
  const hint = MODE_HINTS[mode]?.(drawCount) ?? ''

  return (
    <Stack gap="md">
      <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
        <Text fw={600} size="sm" mb={4}>{selected ? selected.name : 'Select equipment'}</Text>
        <Text size="xs" c="dimmed" mb={12}>
          {effectiveConfig?.data_source === 'earthworks'
            ? "Select the day's Tracking .dxf and/or surface .csv (either alone, or both -- the track drives the border, the CSV gives digging tolerance)."
            : "Select the day's RAW folder. Only the cutter track is read; non-RAW files are ignored."}
        </Text>
        <Group gap={10}>
          <FileButton onChange={handleFilesChange} multiple>
            {(props) => <Button {...props} variant="default" size="xs">Choose Files</Button>}
          </FileButton>
          <Text size="xs" c="dimmed">
            {files.length ? `${files.length} file(s) selected` : 'No file chosen'}
          </Text>
          {effectiveConfig?.require_stations && (
            <>
              <TextInput label="Start station" size="xs" w={130} placeholder="e.g. F43+50" value={stationFrom} onChange={(e) => setStationFrom(e.currentTarget.value)} />
              <TextInput label="End station" size="xs" w={130} placeholder="e.g. F45+00" value={stationTo} onChange={(e) => setStationTo(e.currentTarget.value)} />
            </>
          )}
          <Button size="xs" disabled={!canGenerate} loading={generating} onClick={handleGenerate}>
            Generate chart
          </Button>
          {effectiveConfig?.volume_mode === 'design_grade' && (
            <NumberInput
              label="Volume recovery factor"
              size="xs" w={140} min={0} max={1} step={0.01}
              value={displayedRecovery === '' ? '' : Number(displayedRecovery)}
              onChange={(v) => setRecovery(v === '' || v == null ? '' : String(v))}
            />
          )}
          {generated && (
            <Button size="xs" variant="light" disabled={saving} loading={saving} onClick={handleSave}>
              {existingProgressRecord ? 'Update saved progress' : 'Save to report'}
            </Button>
          )}
          {generated && (
            <Button size="xs" variant="default" onClick={handleDownloadDxf}>Download DXF</Button>
          )}
          {generated && (
            <Button size="xs" variant="default" onClick={handleDownloadPng}>Download PNG</Button>
          )}
        </Group>
        {lastResult && (
          <Text size="xs" c="dimmed" mt={10}>
            1st Pass Today: {lastResult.stats.todaySqFt.toLocaleString()} sq ft · 2nd Pass: {lastResult.stats.secondPassSqFt.toLocaleString()} sq ft ·
            {' '}Progress to Date: {lastResult.stats.cumulativeSqFt.toLocaleString()} sq ft · Advance: {lastResult.stats.advanceFt.toLocaleString()} ft ·
            {' '}Track points: {lastResult.trackPoints.toLocaleString()}
          </Text>
        )}
        {lastResult?.stats.adjustedCy != null && (
          <Text size="xs" c="dimmed" mt={4}>
            Volume above design grade: {lastResult.stats.grossCy.toLocaleString()} CY gross → <b>{lastResult.stats.adjustedCy.toLocaleString()} CY reported</b>
            {lastResult.stats.todaySqFt > 0 && ` · Avg thickness: ${impliedThicknessFt(lastResult.stats.adjustedCy, lastResult.stats.todaySqFt).toFixed(2)} ft`}
          </Text>
        )}
        {lastResult?.stats.volumeNoDataSqFt > 0 && (
          <Text size="xs" c="orange" mt={4}>
            ⚠ The reference survey has no data for {lastResult.stats.volumeNoDataSqFt.toLocaleString()} sq ft of today&apos;s coverage — the volume above may be under-reported. Re-upload a survey that covers this area on the Dredge Chart settings tab.
          </Text>
        )}
        {refSurfaceError && (
          <Text size="xs" c="orange" mt={4}>Reference survey unavailable ({refSurfaceError}) — coverage rendered without a volume estimate.</Text>
        )}
        {saved && (
          <Text size="xs" c="teal" mt={4}>Saved to this report.</Text>
        )}
        {notice && (
          <Text size="xs" c="dimmed" mt={4}>{notice}</Text>
        )}
        {error && (
          <Text size="xs" c="red" mt={10}>{error}</Text>
        )}
        {saveError && (
          <Text size="xs" c="red" mt={4}>{saveError}</Text>
        )}
      </Box>

      {generated && (
        <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
          <Group gap={8} mb={8}>
            <ModeBtn active={mode === 'remove-second'} onClick={toggleMode('remove-second')}>Reject 2nd pass</ModeBtn>
            <ModeBtn active={mode === 'add-second'} onClick={toggleMode('add-second')}>Add 2nd pass</ModeBtn>
            <ModeBtn active={mode === 'remove-area'} onClick={toggleMode('remove-area')}>Remove area (click)</ModeBtn>
            <ModeBtn active={mode === 'exclude'} onClick={toggleMode('exclude')}>Exclude area</ModeBtn>
            <ModeBtn active={mode === 'advance'} onClick={toggleMode('advance')}>Measure advance</ModeBtn>
            {equipmentConfig?.shape_path && (
              <ModeBtn active={mode === 'place-cutter' || mode === 'place-stern'} onClick={toggleMode('place-cutter')}>Move dredge</ModeBtn>
            )}
            {(mode === 'add-second' || mode === 'exclude' || mode === 'advance') && (
              <Button size="xs" color="teal" onClick={finishDrawing}>Done{mode === 'advance' ? ' lane' : ''}</Button>
            )}
          </Group>
          <Group gap={12} mb={8}>
            {removedAreaCount > 0 && <Button size="xs" variant="subtle" onClick={undoLastRemovedArea}>undo last remove</Button>}
            {removedAreaCount > 0 && <Button size="xs" variant="subtle" onClick={clearRemovedAreas}>restore all ({removedAreaCount})</Button>}
            {(manualCount > 0 || removedCount > 0) && <Button size="xs" variant="subtle" onClick={clearSecondEdits}>clear 2nd-pass edits</Button>}
            {excludeCount > 0 && <Button size="xs" variant="subtle" onClick={clearExclude}>clear excluded ({excludeCount})</Button>}
            {advanceCount > 0 && <Button size="xs" variant="subtle" onClick={clearAdvance}>clear advance ({advanceCount})</Button>}
            {hasOverride && <Button size="xs" variant="subtle" onClick={resetPlacement}>reset dredge placement</Button>}
            {equipmentConfig?.shape_path && <Button size="xs" variant="subtle" onClick={toggleFlip}>flip machine{flipDisplay ? ' (flipped)' : ''}</Button>}
          </Group>
          <Group gap={16} align="flex-end">
            <NumberInput label="Gap bridge (ft)" size="xs" w={120} min={0} max={60} value={gapFt} onChange={(v) => setGapFt(Number(v) || 0)} />
            <Button size="xs" variant="default" onClick={applyGap}>Apply</Button>
            <NumberInput label="Overlap tolerance (ft)" size="xs" w={140} min={0} max={30} value={tolFt} onChange={(v) => setTolFt(Number(v) || 0)} />
            <Button size="xs" variant="default" onClick={applyTol}>Apply</Button>
          </Group>
          {hint && <Text size="xs" c="dimmed" mt={8}>{hint}</Text>}
        </Box>
      )}

      <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, textAlign: 'center' }}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ maxWidth: '100%', height: 'auto', display: generated ? 'inline-block' : 'none', cursor: editing ? 'crosshair' : 'default' }}
        />
        {!generated && <Text size="xs" c="dimmed" py={24}>The generated chart will appear here.</Text>}
      </Box>
    </Stack>
  )
}
