// Trimble Earthworks surface-export support for mechanical dredging projects.
// The export is a 1-ft gridded snapshot of the machine's as-built surface:
// CSV `X,Y,VAL,NUM,SDV`, VAL = surface elevation ft, one row per cell,
// cumulative to the moment of export. Unlike HYPACK there is no time axis --
// a day-scoped export's cells ARE that day's bucket positions.
//
// SWING FILTER: the operator lifts each bucket and swings it over
// already-worked ground / open water to the material barge, and Earthworks
// logs those bucket positions too. A cell counts as genuine digging only when
// the recorded surface is below the water elevation (or within tolerance of
// design grade) -- lifted swing/dump readings drop out.
//
// Ported from jfb-fieldops-daily/src/lib/dredge/earthworks.ts (types dropped
// to JSDoc). Full-surface diffing against a PRIOR day's export (diffSurfaces)
// is ported for reuse, but nothing in this app wires it up yet -- that needs
// somewhere to bank each day's surface for tomorrow's diff, and
// jfb_dredge_progress has no field for it today (see DREDGE_FEATURE_GAPS.md).
import { PARAM, close, fillHoles, dropSmallIslands, maskToPolys } from './coverage'

/** @typedef {{x0: number, y0: number, nx: number, ny: number, val: Float32Array}} SurfaceGrid */

export const EARTHWORKS_DEFAULTS = { minCutFt: 0.25, waterBufferFt: 0.25, designTolFt: 0.5, minIslandSqFt: 0 }

/** Parse an Earthworks grid export (X,Y,VAL[,NUM,SDV]) into a SurfaceGrid.
 *  Cells must sit on a 1-ft grid.
 * @param {string} text @returns {SurfaceGrid} */
export function parseEarthworksCsv(text) {
  const rows = []
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || /^x\s*,/i.test(t)) continue
    const p = t.split(',')
    if (p.length < 3) continue
    const x = parseFloat(p[0]), y = parseFloat(p[1]), v = parseFloat(p[2])
    if (!isFinite(x) || !isFinite(y) || !isFinite(v)) continue
    rows.push([x, y, v])
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  if (!rows.length) throw new Error('No data rows found -- is this the Earthworks X,Y,VAL export?')
  const nx = Math.round(maxX - minX) + 1, ny = Math.round(maxY - minY) + 1
  if (!isFinite(nx * ny) || nx * ny > 50_000_000) {
    throw new Error(`Export extent looks wrong (${nx}x${ny} cells) -- coordinates out of range.`)
  }
  const val = new Float32Array(nx * ny).fill(NaN)
  let offGrid = 0
  for (const [x, y, v] of rows) {
    const gx = Math.round(x - minX), gy = Math.round(y - minY)
    if (Math.abs(x - minX - gx) > 0.01 || Math.abs(y - minY - gy) > 0.01) { offGrid++; continue }
    val[gy * nx + gx] = v
  }
  if (offGrid > rows.length * 0.01) {
    throw new Error(`${offGrid} points are off the 1-ft grid -- unexpected export format.`)
  }
  return { x0: minX, y0: minY, nx, ny, val }
}

function sampleAt(s, x, y) {
  const gx = Math.round(x - s.x0), gy = Math.round(y - s.y0)
  if (gx < 0 || gx >= s.nx || gy < 0 || gy >= s.ny) return NaN
  return s.val[gy * s.nx + gx]
}

/** Morphology pad (cells) around the data extent. */
const GRID_PAD = 4

/** @typedef {{waterElev: number, design?: SurfaceGrid|null, minCutFt?: number, waterBufferFt?: number, designTolFt?: number, minIslandSqFt?: number}} DiffOptions */

/** Diff today's surface against the prior stored surface -> the day's genuine
 *  dredging coverage as world-coord rings, swing artifacts filtered out.
 * @param {SurfaceGrid} today @param {SurfaceGrid} prior @param {DiffOptions} opts */
export function diffSurfaces(today, prior, opts) {
  const minCut = opts.minCutFt ?? EARTHWORKS_DEFAULTS.minCutFt
  const waterCutoff = opts.waterElev - (opts.waterBufferFt ?? EARTHWORKS_DEFAULTS.waterBufferFt)
  const designTol = opts.designTolFt ?? EARTHWORKS_DEFAULTS.designTolFt

  const G = { x0: today.x0 - 0.5 - GRID_PAD, y0: today.y0 - 0.5 - GRID_PAD, nx: today.nx + 2 * GRID_PAD, ny: today.ny + 2 * GRID_PAD, R: 1 }
  const mask = new Uint8Array(G.nx * G.ny)
  let cut = 0, swing = 0, newCells = 0
  for (let gy = 0; gy < today.ny; gy++) {
    for (let gx = 0; gx < today.nx; gx++) {
      const v = today.val[gy * today.nx + gx]
      if (isNaN(v)) continue
      const x = today.x0 + gx, y = today.y0 + gy
      const pv = sampleAt(prior, x, y)
      if (isNaN(pv)) { newCells++; continue }
      if (pv - v < minCut) continue
      let genuine = v <= waterCutoff
      if (!genuine && opts.design) {
        const dv = sampleAt(opts.design, x, y)
        if (!isNaN(dv) && v <= dv + designTol) genuine = true
      }
      if (genuine) { mask[(gy + GRID_PAD) * G.nx + (gx + GRID_PAD)] = 1; cut++ } else swing++
    }
  }
  const closeR = Math.max(1, Math.round(PARAM.CLOSE_R / G.R))
  const minIsland = opts.minIslandSqFt ?? EARTHWORKS_DEFAULTS.minIslandSqFt
  let m = fillHoles(close(mask, closeR, G), G)
  if (minIsland > 0) m = dropSmallIslands(m, G, Math.round(minIsland / (G.R * G.R)))
  const rings = maskToPolys(m, G, 0)
  return { rings, cutSqFt: cut, swingFilteredSqFt: swing, newCells }
}

/** @typedef {{rings: [number, number][][], keptSqFt: number, swingFilteredSqFt: number}} CoverageResult */

/** DAY-SCOPED export -> the day's coverage directly: the file's cells ARE the
 *  day's bucket positions, like a HYPACK track. Keep a cell only where the
 *  bucket was genuinely digging: recorded surface below the water elevation,
 *  or within tolerance of design grade. No prior surface involved.
 * @param {SurfaceGrid} today @param {DiffOptions} opts @returns {CoverageResult} */
export function coverageFromSurface(today, opts) {
  const waterCutoff = opts.waterElev - (opts.waterBufferFt ?? EARTHWORKS_DEFAULTS.waterBufferFt)
  const designTol = opts.designTolFt ?? EARTHWORKS_DEFAULTS.designTolFt
  const G = { x0: today.x0 - 0.5 - GRID_PAD, y0: today.y0 - 0.5 - GRID_PAD, nx: today.nx + 2 * GRID_PAD, ny: today.ny + 2 * GRID_PAD, R: 1 }
  const mask = new Uint8Array(G.nx * G.ny)
  let kept = 0, swing = 0
  for (let gy = 0; gy < today.ny; gy++) {
    for (let gx = 0; gx < today.nx; gx++) {
      const v = today.val[gy * today.nx + gx]
      if (isNaN(v)) continue
      let genuine = v <= waterCutoff
      if (!genuine && opts.design) {
        const dv = sampleAt(opts.design, today.x0 + gx, today.y0 + gy)
        if (!isNaN(dv) && v <= dv + designTol) genuine = true
      }
      if (genuine) { mask[(gy + GRID_PAD) * G.nx + (gx + GRID_PAD)] = 1; kept++ } else swing++
    }
  }
  const closeR = Math.max(1, Math.round(PARAM.CLOSE_R / G.R))
  const minIsland = opts.minIslandSqFt ?? EARTHWORKS_DEFAULTS.minIslandSqFt
  let m = kept ? fillHoles(close(mask, closeR, G), G) : mask
  if (kept && minIsland > 0) m = dropSmallIslands(m, G, Math.round(minIsland / (G.R * G.R)))
  const rings = kept ? maskToPolys(m, G, 0) : []
  return { rings, keptSqFt: kept, swingFilteredSqFt: swing }
}

/** The YYMMDD date prefix of an Earthworks export filename, as ISO, or null.
 *  e.g. "260716 TL CAT 374 Progress.csv" -> "2026-07-16".
 * @param {string} name */
export function filenameDateISO(name) {
  const m = name.trim().match(/^(\d{2})(\d{2})(\d{2})\b/)
  if (!m) return null
  const [, yy, mm, dd] = m
  const mo = parseInt(mm, 10), da = parseInt(dd, 10)
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null
  return `20${yy}-${mm}-${dd}`
}
