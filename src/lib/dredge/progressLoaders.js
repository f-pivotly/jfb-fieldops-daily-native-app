import { downloadAttachment } from '../../data'
import { decodeRefSurface, gunzipBytes } from './designVolume'
import { parseDredge, parseCells, parseReferenceLines } from './chart'
import { parseAlignmentDxf } from './alignment'
import { readTrack } from './coverage'
import { parseTrackDxf, looksLikeTrack, trackCoverage, TRACK_DEFAULTS } from './track'
import { parseEarthworksCsv, coverageFromSurface, diffSurfaces, filenameDateISO } from './earthworks'

// Downloads + gunzips + decodes the project's reference-survey grid, caching
// it in refSurfaceRef by storage path so a re-generate doesn't re-fetch it.
export async function loadRefSurface(path, refSurfaceRef) {
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
export function findLatestPriorSurfaceRow(progressRecords, reportDateById, equipmentId, beforeISO) {
  return (progressRecords ?? [])
    .filter((r) => r.equipment_id === equipmentId && r.surface_export_path)
    .map((r) => ({ row: r, date: reportDateById.get(r.report_id) }))
    .filter((c) => c.date && c.date < beforeISO)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.row ?? null
}

// Downloads + gunzips + parses a banked surface export, caching it in
// priorSurfaceRef by storage path so a re-generate doesn't re-fetch it.
export async function loadPriorSurface(path, priorSurfaceRef) {
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
export function readFlipShape(equipmentId) {
  try { return equipmentId ? localStorage.getItem(`dredgeFlip:${equipmentId}`) === '1' : false } catch { return false }
}

// Downloads + parses the equipment's dredge-shape DXF, caching it in
// dredgeShapeRef by storage path so a re-generate doesn't re-fetch it.
export async function loadDredgeShape(path, dredgeShapeRef) {
  if (!path) return null
  if (dredgeShapeRef.current?.path === path) return dredgeShapeRef.current.shape
  const blob = await downloadAttachment(path)
  const shape = parseDredge(await blob.text())
  dredgeShapeRef.current = { path, shape }
  return shape
}

// Downloads + parses the project's CSC / cell-grid DXF, caching it in
// cellsRef by storage path so a re-generate doesn't re-fetch it.
export async function loadCells(path, cellsRef) {
  if (!path) return []
  if (cellsRef.current?.path === path) return cellsRef.current.cells
  const blob = await downloadAttachment(path)
  const cells = parseCells(await blob.text())
  cellsRef.current = { path, cells }
  return cells
}

// Downloads + parses the project's hard-structure alignment DXF (sheet-pile
// wall / bulkhead), caching it in alignmentRef by storage path.
export async function loadAlignment(path, alignmentRef) {
  if (!path) return []
  if (alignmentRef.current?.path === path) return alignmentRef.current.lines
  const blob = await downloadAttachment(path)
  const lines = parseAlignmentDxf(await blob.text())
  alignmentRef.current = { path, lines }
  return lines
}

// Downloads + parses the project's mile-marker/stationing DXF, caching it in
// referenceLinesRef by storage path so a re-generate doesn't re-fetch it.
export async function loadReferenceLines(path, referenceLinesRef) {
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
export function dateMismatchWarning(file, reportDateISO) {
  const nameDate = filenameDateISO(file.name)
  if (!nameDate || !reportDateISO || nameDate === reportDateISO) return ''
  return `Heads up: "${file.name}" looks dated ${nameDate} but this report is ${reportDateISO}. Using it anyway -- double-check you picked the right day's export.`
}

export async function resolveTodayCoverage(cfg, pickedFiles, reportDateISO, onProgress, tuning = {}, priorSurface = null) {
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
