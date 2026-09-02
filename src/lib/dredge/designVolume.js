// DESIGN-GRADE volume estimation for HYPACK (cutter-suction) projects.
// Ported line-for-line from jfb-fieldops-daily/src/lib/dredge/designVolume.ts
// (types dropped to JSDoc, matching coverage.js's own porting convention).
//
// WHY THIS AND NOT THE CUTTER ELEVATION: the source's own investigation found
// cutter-depth reads ~1.16 ft above the surveyed bed and drifts with cut
// depth (0.90 shallow -> 0.70 deep). Some RAW days log no GPS Z at all.
//
// THE MODEL USED INSTEAD — no vertical data from the RAW at all:
//   today's CY = SUM over cells covered for the FIRST time today of
//                max(0, referenceSurvey(x,y) - designElev) x recoveryFactor
// The thickness comes from the QA pay survey PER SQUARE FOOT instead of one
// number for the whole day, and the factor is calibrated against the
// surveyor's own payable volume. More conservative than the manual method on
// re-work: a cell already counted contributes zero on a second pass.
//
// CALIBRATION (source, Fountain Lake, 7/06 -> 8/06 QA pay surveys, 23 RAW
// days): surveyor's payable volume 62,501 CY; model gross on the overlap
// 64,741 CY; measured there 55,988 CY -> factor 0.865.

/** A gridded reference surface (the latest QA pay survey), downsampled from
 *  the 1-ft deliverable so a lake-sized grid is a few MB instead of ~165 MB.
 *  (x0,y0) is the world coordinate of cell (0,0)'s CENTRE. NaN = no data.
 * @typedef {{x0: number, y0: number, nx: number, ny: number, cellFt: number, val: Float32Array}} RefSurface
 */

/** Reference-surface cell size (ft) used when the caller doesn't set one. */
export const DEFAULT_REF_CELL_FT = 2

/** Elevation at a world coordinate, or NaN outside the surveyed extent.
 * @param {RefSurface} s @param {number} x @param {number} y */
export function sampleRef(s, x, y) {
  const gx = Math.round((x - s.x0) / s.cellFt), gy = Math.round((y - s.y0) / s.cellFt)
  if (gx < 0 || gx >= s.nx || gy < 0 || gy >= s.ny) return NaN
  return s.val[gy * s.nx + gx]
}

/** Remaining material above design grade at a world coordinate (ft). Returns
 *  NaN where the survey has no data — callers must COUNT those cells rather
 *  than treat them as zero, or a survey that doesn't reach the day's work
 *  silently under-reports the volume.
 * @param {RefSurface} s @param {number} designElev @param {number} x @param {number} y */
export function prismFt(s, designElev, x, y) {
  const v = sampleRef(s, x, y)
  if (!Number.isFinite(v)) return NaN
  return Math.max(0, v - designElev)
}

/**
 * @typedef {{grossCy: number, cells: number, noDataCells: number, meanPrismFt: number}} PrismVolume
 */

/** Accumulate the design-grade prism volume over a grid mask.
 *  `G` is a coverage grid (world = x0 + gx*R); `cellSqFt` is its cell area.
 * @param {Uint8Array} mask
 * @param {{x0: number, y0: number, nx: number, ny: number, R: number}} G
 * @param {RefSurface} ref
 * @param {number} designElev
 * @param {number} cellSqFt
 * @returns {PrismVolume} */
export function prismVolume(mask, G, ref, designElev, cellSqFt) {
  let cutFt = 0, cells = 0, noDataCells = 0
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const gx = i % G.nx, gy = (i / G.nx) | 0
    const t = prismFt(ref, designElev, G.x0 + gx * G.R, G.y0 + gy * G.R)
    if (Number.isNaN(t)) { noDataCells++; continue }
    cutFt += t * cellSqFt; cells++
  }
  return {
    grossCy: cutFt / 27,
    cells, noDataCells,
    meanPrismFt: cells ? cutFt / (cells * cellSqFt) : 0,
  }
}

/** The average thickness a CY/SF pair implies — shown next to the estimate
 *  so the PE can compare it against the thickness they've been assuming. */
export function impliedThicknessFt(cy, sqFt) {
  return sqFt > 0 ? (cy * 27) / sqFt : 0
}

// --- QA pay survey parsing -------------------------------------------------
// The deliverable is `<YYMMDD> ... Gridded 1x1 Points.xyz`: one `X Y Z` row
// per 1-ft cell, space-delimited, project datum. Streamed and binned in two
// passes (extent, then fill) rather than read into one giant string, since
// the source file can be ~165 MB. Comma/tab delimiters accepted too, so a
// CSV export of the same thing works.

async function scanLines(blob, onLine, onProgress) {
  const reader = blob.stream().pipeThrough(new TextDecoderStream()).getReader()
  let tail = '', done = 0
  const emit = (line) => {
    const t = line.trim()
    if (!t) return
    const p = t.split(/[\s,]+/)
    if (p.length < 3) return
    const x = +p[0], y = +p[1], z = +p[2]
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) onLine(x, y, z)
  }
  for (;;) {
    const { value, done: fin } = await reader.read()
    if (fin) break
    done += value.length
    const chunk = tail + value
    let s = 0
    for (;;) {
      const e = chunk.indexOf('\n', s)
      if (e < 0) break
      emit(chunk.slice(s, e))
      s = e + 1
    }
    tail = chunk.slice(s)
    onProgress?.(done, blob.size)
  }
  emit(tail)
}

/**
 * @typedef {{surface: RefSurface, points: number}} ParsedRefSurface
 */

/** Stream-parse a gridded survey into a downsampled RefSurface (cell mean).
 * @param {Blob} blob
 * @param {number} [cellFt]
 * @param {(pct: number, phase: string) => void} [onProgress]
 * @returns {Promise<ParsedRefSurface>} */
export async function parseSurveyXyz(blob, cellFt = DEFAULT_REF_CELL_FT, onProgress) {
  if (!(cellFt > 0)) throw new Error('Reference cell size must be greater than zero.')
  // Pass 1 — extent only, so pass 2 can allocate exact typed arrays.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, points = 0
  await scanLines(blob, (x, y) => {
    points++
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }, (d, t) => onProgress?.(t ? (d / t) * 50 : 0, 'Reading the survey…'))
  if (!points || !Number.isFinite(minX)) {
    throw new Error('No X Y Z rows found — is this the gridded survey .xyz?')
  }
  const gx0 = Math.floor(minX / cellFt), gy0 = Math.floor(minY / cellFt)
  const nx = Math.floor(maxX / cellFt) - gx0 + 1, ny = Math.floor(maxY / cellFt) - gy0 + 1
  if (!Number.isFinite(nx * ny) || nx * ny > 40_000_000) {
    throw new Error(`Survey extent looks wrong (${nx}x${ny} cells at ${cellFt} ft) — check the coordinates.`)
  }
  // Pass 2 — bin to cell means.
  const sum = new Float64Array(nx * ny)
  const cnt = new Uint32Array(nx * ny)
  await scanLines(blob, (x, y, z) => {
    const ix = Math.floor(x / cellFt) - gx0, iy = Math.floor(y / cellFt) - gy0
    if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) return
    const i = iy * nx + ix
    sum[i] += z; cnt[i]++
  }, (d, t) => onProgress?.(50 + (t ? (d / t) * 50 : 0), 'Building the reference surface…'))
  const val = new Float32Array(nx * ny)
  let filled = 0
  for (let i = 0; i < val.length; i++) {
    if (cnt[i]) { val[i] = sum[i] / cnt[i]; filled++ } else val[i] = NaN
  }
  if (!filled) throw new Error('The survey parsed but produced no cells.')
  // Cell CENTRE of cell (0,0): the bin covers [gx0*cellFt, (gx0+1)*cellFt).
  return {
    surface: { x0: (gx0 + 0.5) * cellFt, y0: (gy0 + 0.5) * cellFt, nx, ny, cellFt, val },
    points,
  }
}

// --- Compact storage --------------------------------------------------------
// Float32 grid + a small header, gzipped before upload.

const MAGIC = 0x4a464253 // "JFBS"
const VERSION = 1
const HEADER_BYTES = 32

/** @param {RefSurface} s @returns {Uint8Array} */
export function encodeRefSurface(s) {
  const out = new ArrayBuffer(HEADER_BYTES + s.val.byteLength)
  const dv = new DataView(out)
  dv.setUint32(0, MAGIC, true)
  dv.setUint32(4, VERSION, true)
  dv.setFloat64(8, s.x0, true)
  dv.setFloat64(16, s.y0, true)
  dv.setUint32(24, s.nx, true)
  // ny is implied by val.length/nx, but store cellFt and derive ny on read so
  // the header stays fixed-size.
  dv.setFloat32(28, s.cellFt, true)
  new Float32Array(out, HEADER_BYTES).set(s.val)
  return new Uint8Array(out)
}

/** @param {ArrayBuffer} buf @returns {RefSurface} */
export function decodeRefSurface(buf) {
  if (buf.byteLength < HEADER_BYTES) throw new Error('Reference surface file is truncated.')
  const dv = new DataView(buf)
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('Not a reference-surface file.')
  const version = dv.getUint32(4, true)
  if (version !== VERSION) throw new Error(`Unsupported reference-surface version ${version}.`)
  const x0 = dv.getFloat64(8, true), y0 = dv.getFloat64(16, true)
  const nx = dv.getUint32(24, true), cellFt = dv.getFloat32(28, true)
  const val = new Float32Array(buf.slice(HEADER_BYTES))
  if (!nx || val.length % nx !== 0) throw new Error('Reference surface grid is malformed.')
  return { x0, y0, nx, ny: val.length / nx, cellFt, val }
}

/** @param {Uint8Array} bytes @returns {Promise<Blob>} */
export async function gzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  const raw = await new Response(stream).blob()
  // Stamp the type explicitly — Response.blob() yields "", which upload
  // layers would otherwise send as application/octet-stream.
  return new Blob([raw], { type: 'application/gzip' })
}

/** @param {Blob} blob @returns {Promise<ArrayBuffer>} */
export async function gunzipBytes(blob) {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).arrayBuffer()
}

/** `260806 Fountain Lake QA Survey Gridded 1x1 Points.xyz` -> "2026-08-06". */
export function surveyFilenameDateISO(name) {
  const m = name.trim().match(/(\d{2})(\d{2})(\d{2})/)
  if (!m) return null
  const [, yy, mm, dd] = m
  const mo = +mm, da = +dd
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null
  return `20${yy}-${mm}-${dd}`
}
