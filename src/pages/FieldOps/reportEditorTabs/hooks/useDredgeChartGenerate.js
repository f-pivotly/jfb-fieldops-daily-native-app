import { useRef, useState } from 'react'
import { detectClusterWindows } from '../../../../lib/dredge/chart'
import { loadAttachmentImage, loadPublicImage, loadTiles } from '../../../../lib/dredge/imageLoaders'
import {
  loadRefSurface,
  loadPriorSurface,
  loadDredgeShape,
  loadCells,
  loadAlignment,
  loadReferenceLines,
  findLatestPriorSurfaceRow,
  resolveTodayCoverage,
} from '../../../../lib/dredge/progressLoaders'

// File selection + chart generation for DredgeProgressTab. Owns the four
// loader-cache refs that only the loaders inside handleGenerate ever touch
// (runRender never reads them) plus the cluster/split-view/preview state.
// The seven refs runRender DOES read (todayPtsRef etc.) live in
// useDredgeChartEngine and are written here via the `refs` argument.
export function useDredgeChartGenerate({
  refs: { todayPtsRef, headingsRef, todayCoverageRingsRef, imagesRef, refSurfaceRef, dredgeShapeRef, surfaceDiffRef },
  runRender,
  resetEdits,
  effectiveConfig,
  report,
  equipmentConfig,
  selected,
  progressRecords,
  reportDateById,
  closeFt,
  islandSqFt,
  setActiveCellLabels,
}) {
  const [files, setFiles] = useState([])
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [dateWarning, setDateWarning] = useState('')
  const [progressMsg, setProgressMsg] = useState('')
  const [refSurfaceError, setRefSurfaceError] = useState('')
  // CSC/DMU cells loaded this generate, for the "worked today" chip picker --
  // a plain array (not a ref) since the chips need to re-render from it.
  const [cellsList, setCellsList] = useState([])
  // Big-move day: separate work areas detected from this generate's coverage
  // (detectClusterWindows), offering a per-area zoomed chart instead of one
  // wide view. Preview-only state -- previewIdx never touches lastResult, so
  // the saved stats always reflect the full day regardless of what's on screen.
  const [clusterWindows, setClusterWindows] = useState([])
  const [splitViews, setSplitViews] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(null)

  const cellsRef = useRef(null)
  const referenceLinesRef = useRef(null)
  const alignmentRef = useRef(null)
  const priorSurfaceRef = useRef(null)

  const handleFilesChange = (newFiles) => {
    setFiles(newFiles)
    setGenerated(false)
    setError(null)
    setNotice('')
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    setNotice('')
    setDateWarning('')
    setProgressMsg('Reading files…')
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
      // flipShape is a sticky per-equipment property, not a per-generate edit
      // -- preserved across this reset, unlike everything else in it.
      resetEdits(true)
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

  return {
    files, generating, generated, error, notice, dateWarning, progressMsg, refSurfaceError, cellsList,
    clusterWindows, splitViews, setSplitViews, previewIdx,
    handleFilesChange, handleGenerate, previewView,
  }
}
