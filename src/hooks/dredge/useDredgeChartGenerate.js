import { useRef, useState } from 'react'
import { detectClusterWindows } from '../../lib/dredge/chart'
import { loadAttachmentImage, loadPublicImage, loadTiles } from '../../lib/dredge/imageLoaders'
import {
  loadRefSurface,
  loadPriorSurface,
  loadDredgeShape,
  loadCells,
  loadAlignment,
  loadReferenceLines,
  loadCoverageBoundary,
  findLatestPriorSurfaceRow,
  resolveTodayCoverage,
} from '../../lib/dredge/progressLoaders'

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
  const [cellsList, setCellsList] = useState([])
  const [clusterWindows, setClusterWindows] = useState([])
  const [splitViews, setSplitViews] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(null)

  const cellsRef = useRef(null)
  const referenceLinesRef = useRef(null)
  const boundaryRef = useRef(null)
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
      const alignment = cfg.alignment_path ? await loadAlignment(cfg.alignment_path, alignmentRef).catch(() => []) : []
      surfaceDiffRef.current = null
      let priorSurface = null
      if (cfg.data_source === 'earthworks' && selected?.id) {
        const priorRow = findLatestPriorSurfaceRow(progressRecords, reportDateById, selected.id, report.report_date)
        if (priorRow) {
          try {
            const grid = await loadPriorSurface(priorRow.surface_export_path, priorSurfaceRef)
            priorSurface = { grid, dateISO: reportDateById.get(priorRow.report_id) }
            // eslint-disable-next-line no-empty
          } catch { }
        }
      }
      const [today, bgImage, colorbarImage, aerialImage, northImage, logoImage, isopachTiles, aerialTiles, cells, referenceLines, boundaryRings] = await Promise.all([
        resolveTodayCoverage(cfg, files, report.report_date, (i, total) => setProgressMsg(`Reading file ${i}/${total}…`), { closeFt, islandSqFt, alignment }, priorSurface),
        loadAttachmentImage(cfg.bg_path),
        loadAttachmentImage(cfg.colorbar_path),
        loadAttachmentImage(cfg.aerial_path),
        loadPublicImage('/dredge/_assets/north.png'),
        loadPublicImage('/dredge/_assets/logo.jpg'),
        loadTiles(cfg.isopach_tiles),
        loadTiles(cfg.aerial_tiles),
        cfg.cells_path
          ? loadCells(cfg.cells_path, cellsRef).catch(() => [])
          : Promise.resolve([]),
        cfg.reference_lines_path
          ? loadReferenceLines(cfg.reference_lines_path, referenceLinesRef).catch(() => ({ segments: [], labels: [] }))
          : Promise.resolve({ segments: [], labels: [] }),
        cfg.boundary_path
          ? loadCoverageBoundary(cfg.boundary_path, boundaryRef).catch(() => [])
          : Promise.resolve([]),
        needsRefSurface
          ? loadRefSurface(cfg.reference_surface_path, refSurfaceRef).catch((err) => {
              setRefSurfaceError(err.message)
              return null
            })
          : Promise.resolve(null),
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
        cells, referenceLines, boundaryRings,
      }
      resetEdits(true)
      setCellsList(cells)
      setActiveCellLabels([])
      const result = runRender()
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
