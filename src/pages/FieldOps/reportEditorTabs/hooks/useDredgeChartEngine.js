import { useRef, useState } from 'react'
import { renderChart, buildProgressDxf, buildProgressDxfFromRings } from '../../../../lib/dredge/chart'
import { readFlipShape } from '../../../../lib/dredge/progressLoaders'

const DEFAULT_GAP = 5, DEFAULT_TOL = 5
const DEFAULT_CLOSE_FT = 2, DEFAULT_ISLAND_SQFT = 150

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function useDredgeChartEngine({
  effectiveConfig,
  project,
  report,
  equipmentConfig,
  selected,
  selectedEquipmentId,
  areaNameById,
  priorRings,
  completedCellLabels,
  displayedMaterialText,
  recovery,
  stationFrom,
  stationTo,
  activeCellLabels,
}) {
  const canvasRef = useRef(null)
  const transformRef = useRef(null)
  const todayPtsRef = useRef([])
  const headingsRef = useRef([])
  const todayCoverageRingsRef = useRef([])
  const drawRef = useRef([])
  const [flipDisplay, setFlipDisplay] = useState(() => readFlipShape(selectedEquipmentId))
  const editRef = useRef({ secondManual: [], removedSeeds: [], excludeRings: [], removedAreaSeeds: [], advanceLines: [], override: null, flipShape: flipDisplay })
  const imagesRef = useRef({})
  const refSurfaceRef = useRef(null)
  const dredgeShapeRef = useRef(null)
  const surfaceDiffRef = useRef(null)
  const pendingCutterRef = useRef(null)

  const [lastResult, setLastResult] = useState(null)
  const [mode, setMode] = useState('view')
  const [gapFt, setGapFt] = useState(DEFAULT_GAP)
  const [tolFt, setTolFt] = useState(DEFAULT_TOL)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [closeFt, setCloseFt] = useState(DEFAULT_CLOSE_FT)
  const [islandSqFt, setIslandSqFt] = useState(DEFAULT_ISLAND_SQFT)
  const [drawCount, setDrawCount] = useState(0)
  const [manualCount, setManualCount] = useState(0)
  const [removedCount, setRemovedCount] = useState(0)
  const [excludeCount, setExcludeCount] = useState(0)
  const [removedAreaCount, setRemovedAreaCount] = useState(0)
  const [advanceCount, setAdvanceCount] = useState(0)
  const [hasOverride, setHasOverride] = useState(false)

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
      completedCellLabels,
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
    if (!viewWindow) {
      transformRef.current = result.transform
      setLastResult({ ...result, trackPoints: todayPtsRef.current.length })
    }
    return result
  }

  const resetEdits = (preserveFlip) => {
    const flip = preserveFlip ? editRef.current.flipShape : readFlipShape(selectedEquipmentId)
    editRef.current = { secondManual: [], removedSeeds: [], excludeRings: [], removedAreaSeeds: [], advanceLines: [], override: null, flipShape: flip }
    pendingCutterRef.current = null
    drawRef.current = []
    setMode('view')
    setDrawCount(0)
    setManualCount(0)
    setRemovedCount(0)
    setExcludeCount(0)
    setRemovedAreaCount(0)
    setAdvanceCount(0)
    setHasOverride(false)
    if (!preserveFlip) {
      setFlipDisplay(flip)
      setGapFt(DEFAULT_GAP)
      setTolFt(DEFAULT_TOL)
      setLastResult(null)
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
  const applyActiveCells = () => runRender()
  const resetPlacement = () => { editRef.current.override = null; setHasOverride(false); runRender() }
  const toggleFlip = () => {
    const next = !editRef.current.flipShape
    editRef.current.flipShape = next
    // eslint-disable-next-line no-empty
    try { if (selectedEquipmentId) localStorage.setItem(`dredgeFlip:${selectedEquipmentId}`, next ? '1' : '0') } catch { }
    setFlipDisplay(next)
    runRender()
  }

  return {
    canvasRef, todayPtsRef, headingsRef, todayCoverageRingsRef, imagesRef, refSurfaceRef, dredgeShapeRef, surfaceDiffRef,
    editRef,
    lastResult,
    mode,
    drawCount, manualCount, removedCount, excludeCount, removedAreaCount, advanceCount,
    gapFt, setGapFt, tolFt, setTolFt, autoAdvance, setAutoAdvance, closeFt, setCloseFt, islandSqFt, setIslandSqFt,
    hasOverride, flipDisplay,
    runRender,
    handleCanvasClick, finishDrawing, toggleMode,
    clearExclude, clearRemovedAreas, undoLastRemovedArea, clearAdvance, clearSecondEdits,
    applyGap, applyTol, applyAutoAdvance, applyActiveCells,
    resetPlacement, toggleFlip,
    resetEdits,
    handleDownloadDxf, handleDownloadPng,
  }
}
