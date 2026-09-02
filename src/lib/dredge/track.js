// Trimble machine-TRACK support for mechanical dredging.
//
// The daily "Tracking" DXF is the machine's own position log and is the
// mechanical equivalent of the HYPACK cutter track: every POLYLINE is ONE
// BUCKET CYCLE -- dig at the bed, swing up, dump into the barge, return. Z is
// the BUCKET TEETH, so "teeth at/below the local bed elevation" identifies
// the digging vertices; everything higher is the bucket travelling.
//
// CRITICAL: never stamp a swath along the polyline PATH -- that traces the
// swing arc over open water. Coverage = the bucket footprint stamped at the
// DIGGING vertices only.
//
// Ported from jfb-fieldops-daily/src/lib/dredge/track.ts (types dropped to
// JSDoc). The hard-structure alignment snap (opts.alignment) is NOT ported --
// alignment.ts is a separate, still-unbuilt gap (DREDGE_FEATURE_GAPS.md); this
// port always behaves as if no alignment is configured.
import { close, fillHoles, dropSmallIslands, maskToPolys } from './coverage'

/** @typedef {{x: number, y: number, z: number}} TrackVertex */
/** @typedef {TrackVertex[]} TrackCycle One bucket cycle: dig -> swing -> dump -> return, in file order. */

export const TRACK_DEFAULTS = {
  bucketWidthFt: 6,
  bedTolFt: 0.5,
  closeFt: 8,
  minIslandSqFt: 150,
}

/** Parse a Trimble Tracking/Dredge-Track DXF into bucket cycles. Handles the
 *  classic POLYLINE/VERTEX/SEQEND form these files use, and drops the stray
 *  near-origin vertex Trimble emits (it makes CAD's zoom-extents span
 *  millions of ft so the drawing looks empty).
 * @param {string} txt @returns {TrackCycle[]} */
export function parseTrackDxf(txt) {
  const raw = txt.split(/\r?\n/)
  const pr = []
  for (let i = 0; i + 1 < raw.length; i += 2) pr.push([raw[i].trim(), raw[i + 1]])
  const cycles = []
  let cur = null
  let v = null
  const flush = () => {
    if (v && cur && v.x != null && v.y != null && v.z != null) cur.push({ x: v.x, y: v.y, z: v.z })
    v = null
  }
  for (const [code, val] of pr) {
    if (code === '0') {
      flush()
      const t = (val || '').trim()
      if (t === 'POLYLINE') cur = []
      else if (t === 'VERTEX') v = { x: null, y: null, z: null }
      else if (t === 'SEQEND') { if (cur) { cycles.push(cur); cur = null } }
    } else if (v) {
      if (code === '10') v.x = parseFloat(val)
      else if (code === '20') v.y = parseFloat(val)
      else if (code === '30') v.z = parseFloat(val)
    }
  }
  flush()
  if (cur) cycles.push(cur)
  return cycles
    .map((c) => c.filter((q) => Math.abs(q.x) > 100000 && isFinite(q.z)))
    .filter((c) => c.length > 0)
}

/** Does this DXF look like a machine track (vs a drawn progress border)?
 *  Tracks have many short cycles with tens of feet of Z travel per cycle.
 * @param {TrackCycle[]} cycles */
export function looksLikeTrack(cycles) {
  if (cycles.length < 20) return false
  let spanned = 0
  for (const c of cycles) {
    let lo = Infinity, hi = -Infinity
    for (const q of c) { if (q.z < lo) lo = q.z; if (q.z > hi) hi = q.z }
    if (hi - lo >= 5) spanned++
  }
  return spanned >= Math.max(5, cycles.length * 0.2)
}

function sampleBed(bed, x, y) {
  const gx = Math.round(x - bed.x0), gy = Math.round(y - bed.y0)
  if (gx < 0 || gx >= bed.nx || gy < 0 || gy >= bed.ny) return NaN
  return bed.val[gy * bed.nx + gx]
}

/** @typedef {{bucketWidthFt?: number, bedTolFt?: number, closeFt?: number, minIslandSqFt?: number, bed?: object|null, maxDigElev?: number|null}} TrackOptions */

/** Build the day's dredged border from bucket cycles.
 * @param {TrackCycle[]} cycles @param {TrackOptions} [opts] */
export function trackCoverage(cycles, opts = {}) {
  const bw = opts.bucketWidthFt ?? TRACK_DEFAULTS.bucketWidthFt
  const tol = opts.bedTolFt ?? TRACK_DEFAULTS.bedTolFt
  const closeFt = opts.closeFt ?? TRACK_DEFAULTS.closeFt
  const minIsland = opts.minIslandSqFt ?? TRACK_DEFAULTS.minIslandSqFt

  const digs = []
  let travel = 0
  for (const c of cycles) {
    for (const q of c) {
      let digging = false
      if (opts.bed) {
        const b = sampleBed(opts.bed, q.x, q.y)
        digging = isFinite(b) && q.z <= b + tol
      } else if (opts.maxDigElev != null) {
        digging = q.z <= opts.maxDigElev
      }
      if (digging) digs.push(q); else travel++
    }
  }
  if (!digs.length) {
    return { rings: [], coverageSqFt: 0, cycles: cycles.length, digVertices: 0, travelVertices: travel, alignmentAddedSqFt: 0 }
  }

  const R = 1, PAD = Math.ceil(closeFt) + Math.ceil(bw) + 4
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const q of digs) {
    if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x
    if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y
  }
  const G = {
    x0: Math.floor(minX) - PAD, y0: Math.floor(minY) - PAD,
    nx: Math.ceil(maxX - minX) + 2 * PAD + 2, ny: Math.ceil(maxY - minY) + 2 * PAD + 2, R,
  }
  if (!Number.isFinite(G.nx * G.ny) || G.nx * G.ny > 50_000_000) {
    throw new Error(`Track extent too large (${G.nx}x${G.ny} cells) -- coordinates look out of range.`)
  }
  const mask = new Uint8Array(G.nx * G.ny)
  const r = bw / 2
  const rc = Math.ceil(r)
  for (const q of digs) {
    const cx = Math.round((q.x - G.x0) / R), cy = Math.round((q.y - G.y0) / R)
    for (let dy = -rc; dy <= rc; dy++) {
      for (let dx = -rc; dx <= rc; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const gx = cx + dx, gy = cy + dy
        if (gx >= 0 && gx < G.nx && gy >= 0 && gy < G.ny) mask[gy * G.nx + gx] = 1
      }
    }
  }
  let m = fillHoles(close(mask, Math.max(1, Math.round(closeFt / R)), G), G)
  if (minIsland > 0) m = dropSmallIslands(m, G, Math.round(minIsland / (R * R)))
  let kept = 0
  for (let i = 0; i < m.length; i++) kept += m[i]
  return {
    rings: maskToPolys(m, G, 0),
    coverageSqFt: kept * R * R,
    cycles: cycles.length,
    digVertices: digs.length,
    travelVertices: travel,
    alignmentAddedSqFt: 0,
  }
}
