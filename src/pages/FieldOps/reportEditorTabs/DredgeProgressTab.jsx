import { useRef, useState } from 'react'
import { Box, Button, Checkbox, Chip, FileButton, Group, NumberInput, Stack, Table, Text, TextInput } from '@mantine/core'
import { useDomainData } from '../../../hooks/useDomainData'
import { useProjectAreas } from '../../../hooks/useProjectAreas'
import { useDredgeEquipmentConfig } from '../../../hooks/useDredgeEquipmentConfig'
import { useConfirmDialog } from '../../../hooks/useConfirmDialog'
import { useAppConfig } from '../../../contexts/appConfigContext'
import { downloadAttachment, uploadAttachment } from '../../../data'
import { readTrack } from '../../../lib/dredge/coverage'
import { renderChart, buildProgressDxf, buildProgressDxfFromRings, detectClusterWindows, parseDredge, parseCells, parseReferenceLines } from '../../../lib/dredge/chart'
import { decodeRefSurface, gzipBytes, gunzipBytes, impliedThicknessFt } from '../../../lib/dredge/designVolume'
import { loadAttachmentImage, loadPublicImage, loadTiles } from '../../../lib/dredge/imageLoaders'
import { parseTrackDxf, looksLikeTrack, trackCoverage, TRACK_DEFAULTS } from '../../../lib/dredge/track'
import { parseEarthworksCsv, coverageFromSurface, diffSurfaces, filenameDateISO } from '../../../lib/dredge/earthworks'
import { parseAlignmentDxf } from '../../../lib/dredge/alignment'

// Must match the real, published domain slug -- see the same note in
// DredgeChartTab.jsx (core.fnc_file_attach validates this against
// core.cfg_domain_info_cache_b, it can't be a cosmetic label).
const DREDGE_PROGRESS_DOMAIN = 'jfb_dredge_progress'

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

// The most recent banked full-surface export for this equipment BEFORE the
// given date, or null. No new query -- progressRecords/reportDateById are
// already fetched in this component for priorRings, so this is a plain
// client-side filter+sort over data already in hand.
function findLatestPriorSurfaceRow(progressRecords, reportDateById, equipmentId, beforeISO) {
  return (progressRecords ?? [])
    .filter((r) => r.equipment_id === equipmentId && r.surface_export_path)
    .map((r) => ({ row: r, date: reportDateById.get(r.report_id) }))
    .filter((c) => c.date && c.date < beforeISO)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.row ?? null
}

// Downloads + gunzips + parses a banked surface export, caching it in
// priorSurfaceRef by storage path so a re-generate doesn't re-fetch it.
async function loadPriorSurface(path, priorSurfaceRef) {
  if (!path) return null
  if (priorSurfaceRef.current?.path === path) return priorSurfaceRef.current.surface
  const blob = await downloadAttachment(path)
  const text = new TextDecoder().decode(await gunzipBytes(blob))
  const surface = parseEarthworksCsv(text)
  priorSurfaceRef.current = { path, surface }
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

// Downloads + parses the project's hard-structure alignment DXF (sheet-pile
// wall / bulkhead), caching it in alignmentRef by storage path.
async function loadAlignment(path, alignmentRef) {
  if (!path) return []
  if (alignmentRef.current?.path === path) return alignmentRef.current.lines
  const blob = await downloadAttachment(path)
  const lines = parseAlignmentDxf(await blob.text())
  alignmentRef.current = { path, lines }
  return lines
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
function dateMismatchWarning(file, reportDateISO) {
  const nameDate = filenameDateISO(file.name)
  if (!nameDate || !reportDateISO || nameDate === reportDateISO) return ''
  return `Heads up: "${file.name}" looks dated ${nameDate} but this report is ${reportDateISO}. Using it anyway -- double-check you picked the right day's export.`
}

async function resolveTodayCoverage(cfg, pickedFiles, reportDateISO, onProgress, tuning = {}, priorSurface = null) {
  if (cfg.data_source !== 'earthworks') {
    const track = await readTrack(pickedFiles, onProgress)
    return { pts: track.pts, headings: track.headings, todayCoverageRings: [], notice: '', dateWarning: '' }
  }
  if (cfg.water_elev_ft == null) {
    throw new Error('Water elevation is not set for this project -- a PM/Admin can add it under Project Settings -> Dredge Chart.')
  }
  const dxfFile = pickedFiles.find((f) => /\.dxf$/i.test(f.name)) ?? null
  const csvFile = pickedFiles.find((f) => /\.(csv|asc|txt)$/i.test(f.name)) ?? null
  if (dxfFile) {
    const dateWarning = dateMismatchWarning(dxfFile, reportDateISO)
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
      closeFt: tuning.closeFt,
      minIslandSqFt: tuning.islandSqFt,
      alignment: tuning.alignment,
      alignmentSnapFt: cfg.alignment_snap_ft,
    })
    if (!cov.rings.length) {
      throw new Error(`No digging found in the track (${cov.cycles} cycles, ${cov.travelVertices} travel positions). If the bucket did dig, the bed tolerance may be too tight -- a PM can adjust it in Project Settings.`)
    }
    const notice = `Border from the machine track: ${cov.cycles} bucket cycles, ${cov.digVertices} digging positions (${cov.travelVertices} travel/swing positions ignored).`
      + (bed ? ' Volume needs a banked prior-day surface, not yet supported.' : ' No surface CSV uploaded, so no volume this time.')
      + (cov.alignmentAddedSqFt > 0 ? ` Extended ${Math.round(cov.alignmentAddedSqFt).toLocaleString()} sq ft to the alignment (wall snap).` : '')
    return { pts: [], headings: [], todayCoverageRings: cov.rings, notice, dateWarning }
  }
  if (csvFile) {
    const dateWarning = dateMismatchWarning(csvFile, reportDateISO)
    const csvText = await csvFile.text()
    const today = parseEarthworksCsv(csvText)
    let design = null
    if (cfg.earthworks_design_path) {
      try { design = parseEarthworksCsv(await (await downloadAttachment(cfg.earthworks_design_path)).text()) } catch { /* optional */ }
    }
    const cov = coverageFromSurface(today, {
      waterElev: Number(cfg.water_elev_ft),
      design,
      closeFt: tuning.closeFt,
      minIslandSqFt: tuning.islandSqFt,
    })
    // Full-surface auto-detect (reference: generateFromEarthworks, cov.keptSqFt
    // > 100_000 -- a day's digging is a few thousand sq ft, a whole-lake/site
    // surface export is hundreds of thousands). Day-scoped: the export's
    // cells ARE the day's bucket positions, charted directly (below).
    // Full-surface: banked and diffed against the prior stored surface
    // instead -- only full-surface exports are ever banked, a day-scoped
    // file must never masquerade as one.
    if (cov.keptSqFt > 100_000) {
      if (!priorSurface) {
        // Reference returns here with nothing rendered -- it can bank
        // immediately, before any save. Native's uploadAttachment needs an
        // existing jfb_dredge_progress row to attach to (see "save row,
        // then attach" below), so there's no row to bank against until the
        // PE actually saves. Rendering the surface's own footprint as
        // today's coverage keeps the normal Generate -> Save flow working
        // end to end instead of leaving a dead end with nothing to save.
        return {
          pts: [], headings: [], todayCoverageRings: cov.rings,
          notice: `This is a full-surface export and no earlier surface was stored, so it will be saved as the starting reference for ${reportDateISO} when you save this report. Not an error -- the next full-surface upload will chart against it.`,
          dateWarning,
          bankableSurface: today,
          bankableCsvText: csvText,
        }
      }
      const diff = diffSurfaces(today, priorSurface.grid, {
        waterElev: Number(cfg.water_elev_ft), design, closeFt: tuning.closeFt, minIslandSqFt: tuning.islandSqFt,
      })
      if (!diff.rings.length) {
        throw new Error(`No dredging progress found vs the ${priorSurface.dateISO} surface (${diff.swingFilteredSqFt.toLocaleString()} sq ft of swing/dump readings filtered). If work WAS done, the two exports may not be the same surface product -- make sure Earthworks exports use the same surface selection every day.`)
      }
      return {
        pts: [], headings: [], todayCoverageRings: diff.rings,
        notice: `Full-surface export -- the day's progress was computed against the ${priorSurface.dateISO} surface.`,
        dateWarning,
        bankableSurface: today,
        bankableCsvText: csvText,
      }
    }
    if (!cov.rings.length) {
      throw new Error(`No dredging found in this export (${cov.swingFilteredSqFt.toLocaleString()} sq ft of swing/dump readings were filtered out).`)
    }
    const notice = `Border from the day's surface export (${cov.keptSqFt.toLocaleString()} sq ft kept, ${cov.swingFilteredSqFt.toLocaleString()} sq ft of swing/dump readings filtered). Day-scoped exports don't carry a cross-day volume.`
    return { pts: [], headings: [], todayCoverageRings: cov.rings, notice, dateWarning }
  }
  throw new Error('Choose the day’s Tracking .dxf and/or the surface .csv.')
}

const DEFAULT_GAP = 5, DEFAULT_TOL = 5
const DEFAULT_CLOSE_FT = 2, DEFAULT_ISLAND_SQFT = 150

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
  const [dateWarning, setDateWarning] = useState('')
  const [progressMsg, setProgressMsg] = useState('')
  // CSC/DMU cells loaded this generate, for the "worked today" chip picker --
  // a plain array (not a ref) since the chips need to re-render from it.
  const [cellsList, setCellsList] = useState([])
  const [activeCellLabels, setActiveCellLabels] = useState([])
  // Big-move day: separate work areas detected from this generate's coverage
  // (detectClusterWindows), offering a per-area zoomed chart instead of one
  // wide view. Preview-only state -- previewIdx never touches lastResult, so
  // the saved stats always reflect the full day regardless of what's on screen.
  const [clusterWindows, setClusterWindows] = useState([])
  const [splitViews, setSplitViews] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [mode, setMode] = useState('view')
  const [gapFt, setGapFt] = useState(DEFAULT_GAP)
  const [tolFt, setTolFt] = useState(DEFAULT_TOL)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [closeFt, setCloseFt] = useState(DEFAULT_CLOSE_FT)
  const [islandSqFt, setIslandSqFt] = useState(DEFAULT_ISLAND_SQFT)
  const [materialText, setMaterialText] = useState('')
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
  // Same idea, for the parsed hard-structure alignment DXF.
  const alignmentRef = useRef(null)
  // Same idea, for the parsed prior banked surface (surface-diff volume).
  const priorSurfaceRef = useRef(null)
  // This generate's full-surface export (if any) + the prior surface it was
  // diffed against, for handleSave to bank and runRender to build the
  // surface-diff volume input from. Null on day-scoped exports/HYPACK days.
  const surfaceDiffRef = useRef(null)
  const pendingCutterRef = useRef(null)

  const selected = equipment.find((e) => e.id === selectedEquipmentId)
  const { config } = useAppConfig()

  const { records: dredgeConfigRecords, loading: configLoading } =
    useDomainData({ domain: 'jfb_dredge_config', system: 'core', projectId: project?.id })
  const { records: progressRecords, loading: progressLoading, create: createProgress, update: updateProgress, reload: reloadProgress } =
    useDomainData({ domain: 'jfb_dredge_progress', system: 'core', projectId: project?.id })
  const { records: cellStatusRecords, create: createCellStatus, update: updateCellStatus, remove: removeCellStatus } =
    useDomainData({ domain: 'jfb_dredge_cell_status', system: 'core', projectId: project?.id })
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const [cellStatusBusy, setCellStatusBusy] = useState(false)
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
  const priorAdvanceFt = priorProgressRows.reduce((sum, row) => sum + Number(row.advance_ft || 0), 0)
  const latestPriorMaterialText = priorProgressRows
    .slice()
    .sort((a, b) => (reportDateById.get(b.report_id) || '').localeCompare(reportDateById.get(a.report_id) || ''))[0]
    ?.material_text ?? ''
  const existingProgressRecord = (progressRecords ?? []).find(
    (row) => row.report_id === report?.id && row.equipment_id === selected?.id,
  )
  // Same "derived, not synced via an effect" pattern as displayedRecovery
  // above: materialText only tracks an explicit PE override for today.
  const displayedMaterialText = materialText !== ''
    ? materialText
    : (existingProgressRecord?.material_text || latestPriorMaterialText || effectiveConfig?.default_material_note || '')

  // Completed-CSC flags (residual dredging): a cell can't take 1st/2nd pass
  // once flagged -- re-entry there charts as residual (gray) from
  // completed_on forward. "Effective" is gated on the report DATE being
  // viewed, not just existence of the row, so an older released report
  // keeps its original classification even after a later flag is added.
  const cellStatusByLabel = new Map((cellStatusRecords ?? []).map((r) => [r.cell_label, r]))
  const isCellEffectivelyComplete = (label) => {
    const row = cellStatusByLabel.get(label)
    return !!row && row.completed_on <= report.report_date
  }
  const toggleCellComplete = async (label) => {
    const row = cellStatusByLabel.get(label)
    const effective = isCellEffectivelyComplete(label)
    if (effective) {
      if (!(await confirm(
        `Un-flag CSC ${label}?\n\nIt has been marked complete since ${row.completed_on.slice(0, 10)}. ` +
        'Removing the flag makes work inside it chart as 1st/2nd pass again (not residual) on all charts from that date forward.',
      ))) return
      setCellStatusBusy(true)
      try {
        await removeCellStatus(row.id)
      } finally {
        setCellStatusBusy(false)
      }
      return
    }
    setCellStatusBusy(true)
    try {
      if (row) {
        await updateCellStatus(row.id, { completed_on: report.report_date })
      } else {
        await createCellStatus({ project_id: project.id, cell_label: label, completed_on: report.report_date })
      }
    } finally {
      setCellStatusBusy(false)
    }
  }

  const runRender = (viewWindow = null, targetCanvas = canvasRef.current) => {
    const cfg = effectiveConfig
    const e = editRef.current
    const refSurface = (cfg.reference_surface_path && refSurfaceRef.current?.path === cfg.reference_surface_path)
      ? refSurfaceRef.current.surface
      : null
    const surfaceDiff = surfaceDiffRef.current
    const volume = (cfg.volume_mode === 'design_grade' && refSurface && cfg.design_elev_ft != null)
      ? {
          mode: 'design-grade',
          ref: refSurface,
          designElev: Number(cfg.design_elev_ft),
          recoveryFactor: recovery.trim() !== '' ? Number(recovery) : (cfg.volume_recovery_factor ?? 0.75),
        }
      : (cfg.volume_mode === 'surface_diff' && surfaceDiff?.today && surfaceDiff?.prior)
        ? {
            mode: 'surface-diff',
            prior: surfaceDiff.prior,
            today: surfaceDiff.today,
            recoveryFactor: recovery.trim() !== '' ? Number(recovery) : (cfg.volume_recovery_factor ?? 0.75),
          }
        : undefined
    const dredgeShape = (equipmentConfig?.shape_path && dredgeShapeRef.current?.path === equipmentConfig.shape_path)
      ? dredgeShapeRef.current.shape
      : null
    const result = renderChart(targetCanvas, {
      todayPts: todayPtsRef.current,
      headings: headingsRef.current,
      todayCoverageRings: todayCoverageRingsRef.current,
      dateISO: report.report_date,
      config: {
        projectTitle: cfg.chart_title_override || project.name,
        area: areaNameById.get(cfg.default_area_id) || '',
        stationText: cfg.require_stations && stationFrom.trim() && stationTo.trim()
          ? `${stationFrom.trim()} to ${stationTo.trim()}` : undefined,
        materials: displayedMaterialText,
        dredgeLabel: equipmentConfig?.chart_label_override || selected?.name || 'Dredge',
        cellsReferenceOnly: !!cfg.cells_reference_only,
        ...imagesRef.current,
      },
      priorRings,
      gapFt,
      overlapTolFt: tolFt,
      excludeRings: e.excludeRings,
      removedAreaSeeds: e.removedAreaSeeds,
      secondPassRings: e.secondManual,
      removedSeeds: e.removedSeeds,
      completedCellLabels: (cellStatusRecords ?? [])
        .filter((r) => r.completed_on <= report.report_date)
        .map((r) => r.cell_label),
      advanceLines: e.advanceLines,
      autoAdvance,
      closeFt,
      activeCellLabels,
      volume,
      dredgeShape,
      override: e.override,
      flipShape: e.flipShape,
      viewWindow,
    })
    // Preview-only render (a zoomed work-area window): draw to the canvas but
    // don't touch the "official" result -- lastResult/transform must always
    // reflect the full day, since that's what gets saved.
    if (!viewWindow) {
      transformRef.current = result.transform
      setLastResult({ ...result, trackPoints: todayPtsRef.current.length })
    }
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
    setDateWarning('')
    setProgressMsg('Reading files…')
    setSaved(false)
    setRefSurfaceError('')
    try {
      const cfg = effectiveConfig
      const needsRefSurface = cfg.volume_mode === 'design_grade' && !!cfg.reference_surface_path
      // Loaded ahead of the Promise.all below (not alongside it) because
      // resolveTodayCoverage -- itself one of that Promise.all's entries --
      // needs the resolved alignment lines synchronously, not another promise.
      const alignment = cfg.alignment_path ? await loadAlignment(cfg.alignment_path, alignmentRef).catch(() => []) : []
      // Same reason: whether this upload turns out to be a full-surface
      // export isn't known until it's parsed (inside resolveTodayCoverage),
      // so the prior surface is always fetched ahead of time when this is an
      // Earthworks project -- harmless overfetch on a day-scoped upload,
      // where it's simply unused.
      surfaceDiffRef.current = null
      let priorSurface = null
      if (cfg.data_source === 'earthworks' && selected?.id) {
        const priorRow = findLatestPriorSurfaceRow(progressRecords, reportDateById, selected.id, report.report_date)
        if (priorRow) {
          try {
            const grid = await loadPriorSurface(priorRow.surface_export_path, priorSurfaceRef)
            priorSurface = { grid, dateISO: reportDateById.get(priorRow.report_id) }
          } catch { /* missing/corrupt banked surface -- treat as no prior */ }
        }
      }
      const [today, bgImage, colorbarImage, aerialImage, northImage, logoImage, isopachTiles, aerialTiles, cells, referenceLines] = await Promise.all([
        resolveTodayCoverage(cfg, files, report.report_date, (i, total) => setProgressMsg(`Reading file ${i}/${total}…`), { closeFt, islandSqFt, alignment }, priorSurface),
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
      surfaceDiffRef.current = today.bankableSurface
        ? { today: today.bankableSurface, prior: priorSurface?.grid ?? null, csvText: today.bankableCsvText }
        : null
      if (today.notice) setNotice(today.notice)
      if (today.dateWarning) setDateWarning(today.dateWarning)
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
      setCellsList(cells)
      setActiveCellLabels([])
      const result = runRender()
      // Re-detect separate work areas so the split-views option reflects this
      // day. The "large move" gap is per-project (Dredge Chart settings),
      // defaulting to 400 ft.
      const areaRings = result.footprintRings.length ? result.footprintRings : result.todayRings
      const windows = detectClusterWindows(areaRings, cfg.split_gap_ft ?? 400)
      setClusterWindows(windows)
      if (windows.length < 2) setSplitViews(false)
      setPreviewIdx(null)
      setGenerated(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
      setProgressMsg('')
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
        material_text: displayedMaterialText || null,
      }
      let progressId
      if (existingProgressRecord) {
        await updateProgress(existingProgressRecord.id, recordData)
        progressId = existingProgressRecord.id
      } else {
        const res = await createProgress(recordData)
        progressId = res?.data?.id
      }

      // Upload the rendered chart(s) to Pivotly file storage and record their
      // paths -- same uploadAttachment() flow every other dredge file already
      // uses. Needs an existing record id first, same "save row, then attach"
      // ordering used everywhere else in this feature.
      if (progressId) {
        // Big-move day: render one zoomed PNG per work area off-screen instead
        // of the single wide view. The row above still stores the FULL day's
        // coverage_rings/footprint_rings -- only the saved IMAGES are per-area,
        // so progress is never divided or lost.
        let blobs = []
        if (splitViews && clusterWindows.length >= 2) {
          const off = document.createElement('canvas')
          for (const w of clusterWindows) {
            runRender(w, off)
            const b = await new Promise((res) => off.toBlob(res, 'image/png'))
            if (b) blobs.push(b)
          }
        }
        if (blobs.length < 2) {
          const full = await new Promise((res) => canvasRef.current?.toBlob(res, 'image/png'))
          if (!full) throw new Error('Could not export the chart image.')
          blobs = [full]
        }
        const fileIds = []
        for (let i = 0; i < blobs.length; i++) {
          const file = new File([blobs[i]], `dredge_progress_${report.report_date}_${i + 1}.png`, { type: 'image/png' })
          const uploadRes = await uploadAttachment({ coreRecordId: progressId, domain: DREDGE_PROGRESS_DOMAIN, file })
          fileIds.push(uploadRes.fileId)
        }
        // Bank this day's full-surface export (if any -- surfaceDiffRef is
        // null on day-scoped exports/HYPACK days) so the next full-surface
        // upload for this equipment can diff against it. Same
        // gzip-then-attach pattern the reference-survey upload already uses
        // (designVolume.js's gzipBytes), just gzipping the raw CSV text
        // instead of a pre-parsed binary grid -- keeps the banked file
        // openable/diffable the same way a prior-day download is read back.
        let surfaceExportPath
        if (surfaceDiffRef.current?.csvText) {
          const gz = await gzipBytes(new TextEncoder().encode(surfaceDiffRef.current.csvText))
          const surfaceFile = new File([gz], `dredge_surface_${report.report_date}.csv.gz`, { type: 'application/gzip' })
          const surfaceUploadRes = await uploadAttachment({ coreRecordId: progressId, domain: DREDGE_PROGRESS_DOMAIN, file: surfaceFile })
          surfaceExportPath = surfaceUploadRes.fileId
        }
        await updateProgress(progressId, {
          chart_path: fileIds[0],
          chart_paths: fileIds.length > 1 ? fileIds : null,
          ...(surfaceExportPath ? { surface_export_path: surfaceExportPath } : {}),
        })
      }

      await reloadProgress()
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      runRender() // restore the full-day view on screen regardless of what was last previewed
      setPreviewIdx(null)
      setSaving(false)
    }
  }

  const handleDownloadDxf = () => {
    if (!lastResult) return
    const dxf = effectiveConfig?.data_source === 'earthworks'
      ? buildProgressDxfFromRings(lastResult.todayRings, lastResult.secondRings)
      : buildProgressDxf(todayPtsRef.current, priorRings, lastResult.secondRings, closeFt)
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
  const applyAutoAdvance = () => runRender()
  // Sweep-smoothing/stray-patch are baked into the initial coverage for
  // mechanical (Earthworks) projects -- resolveTodayCoverage(), not
  // renderChart() -- so applying them there means regenerating. For HYPACK
  // (point-track) projects, closeFt only affects coverageMask() inside
  // renderChart(), so a plain re-render is enough; islandSqFt has no effect
  // there at all (its slider is hidden for that data source, see below).
  const applyTuning = () => {
    if (effectiveConfig?.data_source === 'earthworks') handleGenerate()
    else runRender()
  }
  const applyActiveCells = () => runRender()
  // Draws one zoomed work-area window (or the full day when idx is null) onto
  // the on-screen canvas for preview. Display-only -- lastResult/transform are
  // left untouched (see runRender), so Save always saves the full-day values.
  const previewView = (idx) => {
    if (idx === null) { runRender(); setPreviewIdx(null); return }
    const w = clusterWindows[idx]
    if (!w) return
    runRender(w)
    setPreviewIdx(idx)
  }
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
      {confirmModal}
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
          {generating && progressMsg && (
            <Text size="xs" c="dimmed">{progressMsg}</Text>
          )}
          {(effectiveConfig?.volume_mode === 'design_grade' || effectiveConfig?.volume_mode === 'surface_diff') && (
            <NumberInput
              label="Volume recovery factor"
              size="xs" w={140} min={0} max={1} step={0.01}
              value={displayedRecovery === '' ? '' : Number(displayedRecovery)}
              onChange={(v) => setRecovery(v === '' || v == null ? '' : String(v))}
            />
          )}
          <TextInput
            label="Material encountered"
            size="xs" w={200}
            placeholder="e.g. Silts & Fine Sand"
            value={displayedMaterialText}
            onChange={(e) => setMaterialText(e.currentTarget.value)}
          />
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
            {lastResult.stats.residualSqFt > 0 && ` Residual: ${lastResult.stats.residualSqFt.toLocaleString()} sq ft ·`}
            {' '}Progress to Date: {lastResult.stats.cumulativeSqFt.toLocaleString()} sq ft · Advance: {lastResult.stats.advanceFt.toLocaleString()} ft ·
            {' '}Cumulative Advance: {(priorAdvanceFt + lastResult.stats.advanceFt).toLocaleString()} ft ·
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
        {lastResult?.cellBreakdown?.length > 0 && (
          <Box mt={10} style={{ maxWidth: 520 }}>
            <Text size="xs" fw={600} mb={4}>Per-cell breakdown</Text>
            <Table withTableBorder verticalSpacing={2} fz="10px">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cell</Table.Th>
                  <Table.Th ta="right">Today</Table.Th>
                  <Table.Th ta="right">1st</Table.Th>
                  <Table.Th ta="right">2nd</Table.Th>
                  <Table.Th ta="right">Cumulative</Table.Th>
                  <Table.Th ta="right">%</Table.Th>
                  {lastResult.cellBreakdown[0].adjustedCy != null && <Table.Th ta="right">CY</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lastResult.cellBreakdown.map((c) => (
                  <Table.Tr key={c.label}>
                    <Table.Td>{c.label}</Table.Td>
                    <Table.Td ta="right">{c.todaySqFt.toLocaleString()}</Table.Td>
                    <Table.Td ta="right">{c.firstSqFt.toLocaleString()}</Table.Td>
                    <Table.Td ta="right">{c.secondSqFt.toLocaleString()}</Table.Td>
                    <Table.Td ta="right">{c.cumulativeSqFt.toLocaleString()}</Table.Td>
                    <Table.Td ta="right">{c.pct}%</Table.Td>
                    {c.adjustedCy != null && <Table.Td ta="right">{c.adjustedCy.toLocaleString()}</Table.Td>}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        )}
        {saved && (
          <Text size="xs" c="teal" mt={4}>Saved to this report.</Text>
        )}
        {notice && (
          <Text size="xs" c="dimmed" mt={4}>{notice}</Text>
        )}
        {dateWarning && (
          <Text size="xs" c="orange" mt={4}>{dateWarning}</Text>
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
            <Checkbox
              label="Auto-detect advance line"
              checked={autoAdvance}
              onChange={(ev) => setAutoAdvance(ev.currentTarget.checked)}
              mb={4}
            />
            <Button size="xs" variant="default" onClick={applyAutoAdvance}>Apply</Button>
          </Group>
          <Group gap={16} align="flex-end" mt={12}>
            <NumberInput
              label="Sweep smoothing (ft)"
              description="Closes small gaps within today's coverage"
              size="xs" w={150} min={2} max={20}
              value={closeFt}
              onChange={(v) => setCloseFt(Number(v) || DEFAULT_CLOSE_FT)}
            />
            {effectiveConfig?.data_source === 'earthworks' && (
              <NumberInput
                label="Ignore stray patches under (sq ft)"
                size="xs" w={180} min={0} max={500}
                value={islandSqFt}
                onChange={(v) => setIslandSqFt(Number(v) || 0)}
              />
            )}
            <Button size="xs" variant="default" onClick={applyTuning}>
              {effectiveConfig?.data_source === 'earthworks' ? 'Apply (regenerates)' : 'Apply'}
            </Button>
          </Group>
          {cellsList.length > 0 && (
            <Group gap={8} align="center" mt={12} wrap="wrap">
              <Text size="xs" c="dimmed">Worked today (blank = all cells):</Text>
              {cellsList.filter((c) => c.label).map((c) => (
                <Chip
                  key={c.label}
                  size="xs"
                  checked={activeCellLabels.includes(c.label)}
                  onChange={(checked) => setActiveCellLabels((prev) => (
                    checked ? [...prev, c.label] : prev.filter((l) => l !== c.label)
                  ))}
                >
                  {c.label}
                </Chip>
              ))}
              <Button size="xs" variant="default" onClick={applyActiveCells}>Apply</Button>
              {activeCellLabels.length > 0 && (
                <Button size="xs" variant="subtle" onClick={() => setActiveCellLabels([])}>clear (then Apply)</Button>
              )}
            </Group>
          )}
          {cellsList.length > 0 && effectiveConfig?.data_source !== 'earthworks' && (
            <Group gap={8} align="center" mt={12} wrap="wrap">
              <Text size="xs" c="dimmed">Completed CSCs (work there = residual):</Text>
              {cellsList.filter((c) => c.label).map((c) => (
                <Chip
                  key={c.label}
                  size="xs"
                  disabled={cellStatusBusy}
                  checked={isCellEffectivelyComplete(c.label)}
                  onChange={() => toggleCellComplete(c.label)}
                >
                  {c.label}
                </Chip>
              ))}
              <Text size="xs" c="dimmed">gray chip = complete as of this date; dredging inside it charts as residual, not 2nd pass</Text>
            </Group>
          )}
          {clusterWindows.length >= 2 && (
            <Box mt={12} p={10} style={{ background: '#fbf1dd', border: '1px solid #e6cb87', borderRadius: 6 }}>
              <Checkbox
                label={`Split into ${clusterWindows.length} focused views (large move detected)`}
                checked={splitViews}
                onChange={(ev) => {
                  const checked = ev.currentTarget.checked
                  setSplitViews(checked)
                  if (!checked) previewView(null)
                }}
              />
              <Text size="10px" c="dimmed" mt={4}>
                The full day is saved either way — this only changes the saved chart to {clusterWindows.length} zoomed images, one per work area, instead of a single wide view.
              </Text>
              {splitViews && (
                <Group gap={6} mt={8}>
                  <Text size="10px" c="dimmed">Preview:</Text>
                  {clusterWindows.map((_, i) => (
                    <Button key={i} size="xs" variant={previewIdx === i ? 'filled' : 'default'} onClick={() => previewView(i)}>
                      View {i + 1}
                    </Button>
                  ))}
                  <Button size="xs" variant={previewIdx === null ? 'filled' : 'default'} onClick={() => previewView(null)}>
                    Full day
                  </Button>
                </Group>
              )}
            </Box>
          )}
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
