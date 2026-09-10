import { makeGrid, rasterizePolys, fillHoles, maskToPolys, PARAM, distTransform } from '../dredge/coverage'
import { stepSecs } from './steps'

const DEFAULT_PARAMS = {
  res: PARAM.RES,
  broadcastFt: 6,
  closeFt: 6,
  marginFt: 20,
  minStepTons: 0,
  smoothFt: 2.5,
  simplifyFt: 2,
  forwardThrowFt: 28,
  crossExtraFt: 0,
  rearMarginFt: 3,
  transitionFt: 8,
  planSnapTolFt: 18,
  planExtendFt: 20,
}

const and = (a, b) => {
  const o = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) o[i] = a[i] && b[i] ? 1 : 0
  return o
}
const or = (a, b) => {
  const o = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) o[i] = a[i] || b[i] ? 1 : 0
  return o
}
const andNot = (a, b) => {
  const o = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) o[i] = a[i] && !b[i] ? 1 : 0
  return o
}
const orInto = (acc, m) => (acc ? or(acc, m) : m)
const count = (a) => {
  let n = 0
  for (let i = 0; i < a.length; i++) n += a[i]
  return n
}
const invMask = (a) => {
  const o = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) o[i] = a[i] ? 0 : 1
  return o
}

const dilateMask = (mask, r, G) => {
  const d = distTransform(mask, G)
  const o = new Uint8Array(mask.length)
  for (let i = 0; i < d.length; i++) o[i] = d[i] <= r ? 1 : 0
  return o
}
const erodeMask = (mask, r, G) => invMask(dilateMask(invMask(mask), r, G))
const closeMask = (mask, r, G) => erodeMask(dilateMask(mask, r, G), r, G)
const openMask = (mask, r, G) => dilateMask(erodeMask(mask, r, G), r, G)
const smoothMask = (mask, r, G) => (r <= 0 ? mask : openMask(closeMask(mask, r, G), r, G))

const layerKey = (id) => id ?? '__none__'

function laneHeading(centres) {
  const n = centres.length
  if (n < 2) return 0
  let mx = 0
  let my = 0
  for (const [x, y] of centres) {
    mx += x
    my += y
  }
  mx /= n
  my /= n
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const [x, y] of centres) {
    const dx = x - mx
    const dy = y - my
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  if (Math.abs(sxy) < 1e-9 && Math.abs(sxx - syy) < 1e-9) {
    const [x0, y0] = centres[0]
    const [x1, y1] = centres[n - 1]
    return Math.atan2(y1 - y0, x1 - x0)
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy)
}

function stepRect(cx, cy, heading, lenFt, widFt) {
  const c = Math.cos(heading)
  const s = Math.sin(heading)
  const hl = lenFt / 2
  const hw = widFt / 2
  const local = [
    [-hl, -hw],
    [hl, -hw],
    [hl, hw],
    [-hl, hw],
  ]
  return local.map(([lx, ly]) => [cx + lx * c - ly * s, cy + lx * s + ly * c])
}

function laneBoxes(steps, heading, forwardThrowFt, crossExtraFt) {
  const boxes = steps.map((s) => stepRect(s.e, s.n, heading, s.lengthFt, s.widthFt + 2 * crossExtraFt))
  if (forwardThrowFt > 0 && steps.length >= 1) {
    const first = steps[0]
    const last = steps[steps.length - 1]
    let dx = first.e - last.e
    let dy = first.n - last.n
    const d = Math.hypot(dx, dy)
    if (d < 1) {
      dx = Math.cos(heading)
      dy = Math.sin(heading)
    } else {
      dx /= d
      dy /= d
    }
    const off = first.lengthFt / 2 + forwardThrowFt / 2
    boxes.push(
      stepRect(
        first.e + dx * off,
        first.n + dy * off,
        heading,
        forwardThrowFt,
        first.widthFt + 2 * crossExtraFt,
      ),
    )
  }
  return boxes
}

function boundsOf(boundaries) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boundaries)
    for (const r of b.rings)
      for (const [x, y] of r) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
  return { minX, minY, maxX, maxY }
}

export function computeSpreaderCoverage(steps, boundaries, params = {}) {
  const P = { ...DEFAULT_PARAMS, ...params }
  const { minX, minY, maxX, maxY } = boundsOf(boundaries)
  if (!isFinite(minX)) {
    return { breakdown: [], grid: makeGrid(0, 0, 1, 1), recordedSteps: steps.length, placedSteps: 0 }
  }
  const m = P.marginFt
  const G = makeGrid(minX - m, minY - m, maxX + m, maxY + m)
  const cellSf = G.R * G.R
  const closeR = Math.max(1, Math.round(P.closeFt / G.R))
  const transR = Math.max(0, Math.round(P.transitionFt / G.R))

  const placed = steps.filter((s) => !(P.minStepTons > 0 && s.tons != null && s.tons < P.minStepTons))

  const boundMask = new Map()
  const ringMask = new Map()
  for (const b of boundaries) {
    const bm = rasterizePolys(b.rings, G)
    boundMask.set(b.area, bm)
    ringMask.set(b.area, transR > 0 ? andNot(bm, erodeMask(bm, transR, G)) : new Uint8Array(bm.length))
  }

  const laneGroups = new Map()
  for (const s of placed) {
    const k = `${s.lane}||${layerKey(s.layerId)}`
    const list = laneGroups.get(k)
    if (list) list.push(s)
    else laneGroups.set(k, [s])
  }
  const layerMask = new Map()
  const wideMask = new Map()
  for (const [k, gsteps] of laneGroups) {
    const lk = k.split('||')[1]
    const ordered = [...gsteps].sort((a, b) => (stepSecs(a) ?? 0) - (stepSecs(b) ?? 0))
    const heading = laneHeading(ordered.map((s) => [s.e, s.n]))
    const boxes = rasterizePolys(laneBoxes(ordered, heading, P.forwardThrowFt, 0), G)
    layerMask.set(lk, orInto(layerMask.get(lk), boxes))
    if (transR > 0) {
      const wide = rasterizePolys(laneBoxes(ordered, heading, P.forwardThrowFt, P.transitionFt), G)
      wideMask.set(lk, orInto(wideMask.get(lk), wide))
    }
  }
  for (const [lk, mask] of layerMask) layerMask.set(lk, closeMask(mask, closeR, G))

  const breakdown = []
  for (const [lk, mask] of layerMask) {
    for (const b of boundaries) {
      const bm = boundMask.get(b.area)
      const clipped = and(mask, bm)
      if (count(clipped) === 0) continue
      const wide = wideMask.get(lk)
      const withTransition = transR > 0 && wide ? or(clipped, and(wide, ringMask.get(b.area))) : clipped
      const out = and(smoothMask(fillHoles(withTransition, G), Math.round(P.smoothFt / G.R), G), bm)
      if (count(out) === 0) continue
      breakdown.push({
        area: b.area,
        layerId: lk === '__none__' ? null : lk,
        sqFt: Math.round(count(out) * cellSf),
        polys: maskToPolys(out, G, P.simplifyFt),
      })
    }
  }
  breakdown.sort((a, b) => a.area.localeCompare(b.area) || String(a.layerId).localeCompare(String(b.layerId)))
  return { breakdown, grid: G, recordedSteps: steps.length, placedSteps: placed.length }
}

export function computeSpreaderCoverageFromPlan(steps, lanes, cellLenFt, boundaries, params = {}) {
  const P = { ...DEFAULT_PARAMS, ...params }
  const { minX, minY, maxX, maxY } = boundsOf(boundaries)
  if (!isFinite(minX) || !lanes.length) {
    return { breakdown: [], grid: makeGrid(0, 0, 1, 1), recordedSteps: steps.length, placedSteps: 0 }
  }
  const G = makeGrid(minX - P.marginFt, minY - P.marginFt, maxX + P.marginFt, maxY + P.marginFt)
  const cellSf = G.R * G.R
  const closeR = Math.max(1, Math.round(P.closeFt / G.R))
  const boundMask = new Map()
  for (const b of boundaries) boundMask.set(b.area, rasterizePolys(b.rings, G))

  const geom = lanes.map((L) => {
    let ux = L.c1[0] - L.c0[0]
    let uy = L.c1[1] - L.c0[1]
    const len = Math.hypot(ux, uy) || 1
    ux /= len
    uy /= len
    return { ux, uy, vx: -uy, vy: ux, len, w: L.w }
  })

  const placed = steps.filter((s) => !(P.minStepTons > 0 && s.tons != null && s.tons < P.minStepTons))

  const half = cellLenFt / 2
  const worked = new Map()
  const allByLayer = new Map()
  for (const s of placed) {
    const lk = layerKey(s.layerId)
    const bucket = allByLayer.get(lk)
    if (bucket) bucket.push(s)
    else allByLayer.set(lk, [s])
    let bl = -1
    let bestCross = Infinity
    let bestA = 0
    for (let li = 0; li < lanes.length; li++) {
      const g = geom[li]
      const dx = s.e - lanes[li].c0[0]
      const dy = s.n - lanes[li].c0[1]
      const a = dx * g.ux + dy * g.uy
      const cross = Math.abs(dx * g.vx + dy * g.vy)
      if (a < -half - P.planSnapTolFt || a > g.len + half + P.planSnapTolFt) continue
      if (cross <= g.w / 2 + P.planSnapTolFt && cross < bestCross) {
        bestCross = cross
        bl = li
        bestA = a
      }
    }
    if (bl < 0) continue
    let byLane = worked.get(lk)
    if (!byLane) {
      byLane = new Map()
      worked.set(lk, byLane)
    }
    const span = byLane.get(bl)
    if (span) {
      if (bestA < span[0]) span[0] = bestA
      if (bestA > span[1]) span[1] = bestA
    } else byLane.set(bl, [bestA, bestA])
  }

  const breakdown = []
  for (const [lk, laneSteps] of allByLayer) {
    const rects = []
    for (const [li, [aMin, aMax]] of worked.get(lk) ?? []) {
      const g = geom[li]
      const L = lanes[li]
      const hw = g.w / 2
      const a0 = aMin - half - P.planExtendFt
      const a1 = aMax + half + P.planExtendFt
      const pt = (a, side) => [
        L.c0[0] + a * g.ux + side * hw * g.vx,
        L.c0[1] + a * g.uy + side * hw * g.vy,
      ]
      rects.push([pt(a0, -1), pt(a1, -1), pt(a1, 1), pt(a0, 1)])
    }
    const boxes = []
    const byLane = new Map()
    for (const s of laneSteps) {
      const list = byLane.get(s.lane)
      if (list) list.push(s)
      else byLane.set(s.lane, [s])
    }
    for (const [, gsteps] of byLane) {
      const ordered = [...gsteps].sort((a, b) => (stepSecs(a) ?? 0) - (stepSecs(b) ?? 0))
      const heading = laneHeading(ordered.map((s) => [s.e, s.n]))
      boxes.push(...laneBoxes(ordered, heading, P.forwardThrowFt, P.crossExtraFt))
    }
    if (!rects.length && !boxes.length) continue
    const merged = closeMask(rasterizePolys([...rects, ...boxes], G), closeR, G)
    for (const b of boundaries) {
      const bm = boundMask.get(b.area)
      const clipped = and(merged, bm)
      if (count(clipped) === 0) continue
      const out = and(smoothMask(fillHoles(clipped, G), Math.round(P.smoothFt / G.R), G), bm)
      if (count(out) === 0) continue
      breakdown.push({
        area: b.area,
        layerId: lk === '__none__' ? null : lk,
        sqFt: Math.round(count(out) * cellSf),
        polys: maskToPolys(out, G, P.simplifyFt),
      })
    }
  }
  breakdown.sort((a, b) => a.area.localeCompare(b.area) || String(a.layerId).localeCompare(String(b.layerId)))
  return { breakdown, grid: G, recordedSteps: steps.length, placedSteps: placed.length }
}

export function computeCoverageFromRings(rings, boundaries, layerId = null, params = {}) {
  const P = { ...DEFAULT_PARAMS, ...params }
  if (!rings.length) return []
  const { minX, minY, maxX, maxY } = boundsOf(boundaries)
  if (!isFinite(minX)) return []
  const G = makeGrid(minX - P.marginFt, minY - P.marginFt, maxX + P.marginFt, maxY + P.marginFt)
  const cellSf = G.R * G.R
  const drawn = rasterizePolys(rings, G)
  const out = []
  for (const b of boundaries) {
    const clipped = fillHoles(and(drawn, rasterizePolys(b.rings, G)), G)
    const c = count(clipped)
    if (c === 0) continue
    out.push({ area: b.area, layerId, sqFt: Math.round(c * cellSf), polys: maskToPolys(clipped, G, P.simplifyFt) })
  }
  return out
}
