import { cellKey, sqFtForCellKeys } from './grid'
import { pointInPoly, ordinal } from '../dredge/coverage'

const FONT = 'Arial, "Segoe UI", sans-serif'
const BAND = '#16314b'
const PAPER = '#ffffff'
const MAP_BG = '#9aa6ac'
const CELL_EDGE = '#3d3d3a'
const GRID_EDGE = '#7f8a84'
const DAILY = '#779C5D'
const DAILY_EDGE = '#3d5c28'
const DAILY_2ND = '#3F6B3A'
const STRUCTURE = '#D4452B'
const EXTENTS_FILL = 'rgba(190,255,232,0.92)'
const EXTENTS_EDGE = '#E08A2E'
export const EXTENTS_SWATCH = '#BEFFE8'

const PLANT_FILL = { hull: '#c0392b', mats: '#b88a00', machine: '#4f7f3f' }
const PLANT_EDGE = '#1a1a1a'

export function plantTransform(plant, pose) {
  const nat = Math.atan2(plant.stern[1] - plant.bow[1], plant.stern[0] - plant.bow[0])
  const tgt = Math.atan2(pose.stern[1] - pose.bow[1], pose.stern[0] - pose.bow[0])
  const rot = tgt - nat
  const cosR = Math.cos(rot)
  const sinR = Math.sin(rot)
  return ([x, y]) => {
    const dx = x - plant.bow[0]
    const dy = y - plant.bow[1]
    return [pose.bow[0] + dx * cosR - dy * sinR, pose.bow[1] + dx * sinR + dy * cosR]
  }
}

const ZOOM_MAX_H = 1000
const ZOOM_MIN_H = 560

export function framingFrom(configured) {
  return configured === 'work' ? 'work' : 'site'
}

export function computeWorkFrame(focus, site) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const [x, y] of focus) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  if (!Number.isFinite(x0)) throw new Error('computeWorkFrame needs at least one point.')

  const pad = Math.max(0.08 * Math.max(x1 - x0, y1 - y0), 25)
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad

  let w = x1 - x0
  let h = y1 - y0
  const mapH = Math.min(ZOOM_MAX_H, Math.max(ZOOM_MIN_H, Math.round((MAPW * h) / w)))
  const want = MAPW / mapH
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  if (w / h < want) {
    w = h * want; x0 = cx - w / 2; x1 = cx + w / 2
  } else {
    h = w / want; y0 = cy - h / 2; y1 = cy + h / 2
  }

  if (site) {
    if (w <= site.wR - site.wL) {
      if (x0 < site.wL) { x1 += site.wL - x0; x0 = site.wL }
      else if (x1 > site.wR) { x0 -= x1 - site.wR; x1 = site.wR }
    }
    if (h <= site.wT - site.wB) {
      if (y0 < site.wB) { y1 += site.wB - y0; y0 = site.wB }
      else if (y1 > site.wT) { y0 -= y1 - site.wT; y1 = site.wT }
    }
  }
  return { wL: x0, wR: x1, wB: y0, wT: y1, mapH }
}

export const MATERIAL_COLORS = [
  { match: /ballast/i, color: '#FFFF00', label: 'Ballast Stone' },
  { match: /class\s*b/i, color: '#00E6A9', label: 'Class B Riprap' },
  { match: /class\s*e/i, color: '#C500FF', label: 'Class E Riprap' },
  { match: /class\s*a/i, color: '#FFBEBE', label: 'Class A Riprap' },
  { match: /barrier/i, color: '#9C9C9C', label: 'Barrier Stone' },
]

const LAYER_FALLBACK_COLORS = [
  '#E8873A', '#F2D65C', '#4FA3D1', '#B07AA1', '#76B7B2', '#9C7A5F',
]

export const PROGRESS_TO_DATE = '#00A9E6'

export function colorForLayer(layerName, index) {
  if (!layerName) return null
  for (const m of MATERIAL_COLORS) if (m.match.test(layerName)) return m.color
  if (index != null && index >= 0) return LAYER_FALLBACK_COLORS[index % LAYER_FALLBACK_COLORS.length]
  return null
}

export function layerPassColorsFrom(layers) {
  const out = new Map()
  for (const l of layers ?? []) {
    const first = l.chart_color?.trim()
    if (!first) continue
    out.set(l.id, { first, second: l.chart_color_2nd?.trim() || first })
  }
  return out
}

export function passSplitLegend(layers) {
  const cols = layerPassColorsFrom(layers)
  if (cols.size === 0) return []
  const out = []
  for (const l of layers ?? []) {
    const c = cols.get(l.id)
    if (!c) continue
    const name = l.layer_report_name || l.layer_name || 'Lift'
    out.push({ key: `${l.id}-1`, label: `${name} 1st Pass`, color: c.first })
    out.push({ key: `${l.id}-2`, label: `${name} 2nd Pass`, color: c.second })
  }
  out.push({ key: 'progress-to-date', label: 'Progress To Date', color: PROGRESS_TO_DATE })
  return out
}

export function legendForLayers(layers) {
  const split = passSplitLegend(layers)
  if (split.length > 0) return { entries: split, complete: true }
  if (!layers || layers.length === 0) return null
  const allKnown = layers.every((l) => MATERIAL_COLORS.some(
    (m) => m.match.test(l.layer_report_name || l.layer_name || ''),
  ))
  if (allKnown) return null
  return {
    entries: layers.map((l, i) => {
      const name = l.layer_report_name || l.layer_name || 'Lift'
      return { key: l.id, label: name, color: colorForLayer(name, i) ?? DAILY }
    }),
    complete: false,
  }
}

export const MATERIAL_LEGEND = MATERIAL_COLORS.map((m) => ({ key: m.label, label: m.label, color: m.color }))

export function buildLiftPalette(layers) {
  const ranked = (layers ?? [])
    .filter((l) => l && l.id && l.active !== false)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      || String(a.layer_name ?? '').localeCompare(String(b.layer_name ?? '')))
  const order = new Map()
  ranked.forEach((l, i) => order.set(l.id, i))
  const spec = legendForLayers(ranked)
  const layerColors = layerPassColorsFrom(ranked)
  const entries = spec?.entries ?? MATERIAL_LEGEND
  return {
    order,
    layerColors,
    legend: spec?.entries ?? null,
    legendComplete: spec?.complete ?? false,
    entries,
  }
}

function liftOrdinal(l, layerOrder) {
  const byConfig = l.layerId ? layerOrder?.get(l.layerId) : undefined
  if (byConfig !== undefined) return byConfig
  const m = MATERIAL_COLORS.findIndex((x) => x.match.test(l.layerName))
  return 1000 + (m < 0 ? MATERIAL_COLORS.length : m)
}

export function liftsFromCoverage(coverage, layerOrder) {
  return (coverage?.layers ?? [])
    .filter((l) => l.layerId)
    .map((l) => ({ label: l.layerName, sqFt: l.sqFt, o: liftOrdinal(l, layerOrder) }))
    .sort((a, b) => a.o - b.o || a.label.localeCompare(b.label))
    .map(({ label, sqFt }) => ({ label, sqFt }))
}

export function materialsFromLifts(lifts) {
  const out = []
  for (const l of lifts ?? []) {
    const m = MATERIAL_COLORS.find((x) => x.match.test(l.label))
    const label = m ? m.label : String(l.label ?? '').trim()
    if (label && !out.includes(label)) out.push(label)
  }
  return out
}

function priorCellsByLift(prior) {
  const out = new Map()
  for (const day of prior ?? []) {
    for (const l of day.layers) {
      if (!l.layerId) continue
      let set = out.get(l.layerId)
      if (!set) out.set(l.layerId, (set = new Set()))
      for (const [c, r] of l.cells) set.add(cellKey(c, r))
    }
  }
  return out
}

export function splitPasses(prior, today, grid, layerOrder) {
  const seenByLift = priorCellsByLift(prior)
  const firstSeen = new Set()
  const secondSeen = new Set()
  const byLift = []
  const sorted = [...(today?.layers ?? [])].sort(
    (a, b) => liftOrdinal(a, layerOrder) - liftOrdinal(b, layerOrder)
      || a.layerName.localeCompare(b.layerName),
  )
  for (const l of sorted) {
    const first = new Set()
    const second = new Set()
    const before = l.layerId ? seenByLift.get(l.layerId) : undefined
    for (const [c, r] of l.cells) {
      const key = cellKey(c, r)
      if (before?.has(key)) { second.add(key); secondSeen.add(key) }
      else { first.add(key); firstSeen.add(key) }
    }
    byLift.push({
      label: l.layerName,
      firstPassSqFt: sqFtForCellKeys(first, grid),
      secondPassSqFt: sqFtForCellKeys(second, grid),
    })
  }
  return {
    firstPassCells: firstSeen.size,
    secondPassCells: secondSeen.size,
    firstPassSqFt: sqFtForCellKeys(firstSeen, grid),
    secondPassSqFt: sqFtForCellKeys(secondSeen, grid),
    byLift,
  }
}

function buildPassSplitFills(prior, today, layerColors) {
  const fills = new Map()
  const unrecorded = new Set()
  for (const day of prior ?? []) {
    for (const l of day.layers) {
      for (const [c, r] of l.cells) fills.set(cellKey(c, r), PROGRESS_TO_DATE)
    }
  }
  if (today) {
    const seenByLift = priorCellsByLift(prior)
    for (const l of today.layers) {
      const cols = l.layerId ? layerColors.get(l.layerId) : undefined
      const before = l.layerId ? seenByLift.get(l.layerId) : undefined
      for (const [c, r] of l.cells) {
        const key = cellKey(c, r)
        if (!cols) {
          if (!fills.has(key)) unrecorded.add(key)
          continue
        }
        fills.set(key, before?.has(key) ? cols.second : cols.first)
        unrecorded.delete(key)
      }
    }
  }
  return { fills, unrecorded: unrecorded.size }
}

export function buildCellFills(prior, today, layerOrder, layerColors) {
  if (layerColors && layerColors.size > 0) return buildPassSplitFills(prior, today, layerColors)
  const fills = new Map()
  const unrecordedCells = new Set()
  for (const day of prior ?? []) {
    for (const l of day.layers) {
      const col = colorForLayer(l.layerName, l.layerId ? layerOrder?.get(l.layerId) : undefined)
      for (const [c, r] of l.cells) {
        const key = cellKey(c, r)
        if (col) { fills.set(key, col); unrecordedCells.delete(key) }
        else if (!fills.has(key)) unrecordedCells.add(key)
      }
    }
  }
  if (today) {
    const seenByLift = priorCellsByLift(prior)
    for (const l of today.layers) {
      const before = l.layerId ? seenByLift.get(l.layerId) : undefined
      for (const [c, r] of l.cells) {
        const key = cellKey(c, r)
        fills.set(key, before?.has(key) ? DAILY_2ND : DAILY)
        unrecordedCells.delete(key)
      }
    }
  }
  return { fills, unrecorded: unrecordedCells.size }
}

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const MAPW = 1000
const SIDE = 30
const FOOTERH = 76
const BAND_H = 22
const LEGEND_Y = 66
const LEGEND_PITCH = 30
const LEGEND_COLW = 228
const LEGEND_COLS = 3

const CLIP_SAMPLES = 12

function keptFraction(poly, boundary) {
  const [ax, ay] = poly[0]
  const ux = (poly[1][0] - ax) / CLIP_SAMPLES
  const uy = (poly[1][1] - ay) / CLIP_SAMPLES
  const vx = (poly[3][0] - ax) / CLIP_SAMPLES
  const vy = (poly[3][1] - ay) / CLIP_SAMPLES
  let kept = 0
  for (let i = 0; i < CLIP_SAMPLES; i++) {
    for (let j = 0; j < CLIP_SAMPLES; j++) {
      const fi = i + 0.5
      const fj = j + 0.5
      if (pointInPoly(ax + ux * fi + vx * fj, ay + uy * fi + vy * fj, boundary)) kept++
    }
  }
  return kept / (CLIP_SAMPLES * CLIP_SAMPLES)
}

export function clippedSqFtForFills(grid, cellFills) {
  const boundary = grid?.grid?.boundary
  if (!boundary || !cellFills?.size) return 0
  const cellSf = grid.grid.cellFt * grid.grid.cellFt
  let trimmed = 0
  for (const key of cellFills.keys()) {
    const [c, r] = key.split(',').map(Number)
    const poly = grid.cellPolygon(c, r)
    if (poly.every(([x, y]) => pointInPoly(x, y, boundary))) continue
    trimmed += cellSf * (1 - keptFraction(poly, boundary))
  }
  return Math.round(trimmed)
}

function ellipsize(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text
  let s = text
  while (s.length > 1 && g.measureText(`${s}…`).width > maxW) s = s.slice(0, -1)
  return `${s}…`
}

export function renderPlacementChart(canvas, input) {
  const { grid, aerialGeoref } = input
  const boundary = grid.grid.boundary

  let site
  if (aerialGeoref) {
    const { wL: l, wR: r, wT: t, wB: b } = aerialGeoref
    site = { wL: l, wR: r, wT: t, wB: b, mapH: Math.round((MAPW * (t - b)) / (r - l)) }
  } else {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const [c, r] of grid.grid.cells) {
      for (const [x, y] of grid.cellPolygon(c, r)) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    const pad = 60
    site = {
      wL: x0 - pad, wR: x1 + pad, wB: y0 - pad, wT: y1 + pad,
      mapH: Math.round((MAPW * (y1 - y0 + pad * 2)) / (x1 - x0 + pad * 2)),
    }
  }

  const zoomed = framingFrom(input.framing) === 'work'
  let view = site
  if (zoomed) {
    const focus = []
    for (const ring of input.designExtents?.rings ?? []) focus.push(...ring)
    for (const key of input.cellFills.keys()) {
      const [c, r] = key.split(',').map(Number)
      focus.push(...grid.cellPolygon(c, r))
    }
    if (!focus.length) for (const [c, r] of grid.grid.cells) focus.push(...grid.cellPolygon(c, r))
    view = computeWorkFrame(focus, aerialGeoref ? site : null)
  }
  const { wL, wR, wT, wB } = view

  const legend = [
    ...(input.legend ?? MATERIAL_LEGEND).map((l) => [l.label, l.color]),
    ...(input.legendComplete
      ? []
      : [['Daily Progress (1st Pass)', DAILY], ['Daily Progress (2nd Pass)', DAILY_2ND]]),
  ]
  const legendRows = Math.max(1, Math.ceil(legend.length / LEGEND_COLS))
  const headerH = Math.max(150, LEGEND_Y + (legendRows - 1) * LEGEND_PITCH + 24)

  const mapH = view.mapH
  const W = MAPW + SIDE * 2
  const H = headerH + mapH + FOOTERH
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Could not get a 2D canvas context.')

  const ox = SIDE
  const oy = headerH
  const sc = MAPW / (wR - wL)
  const sx = (x) => ox + (x - wL) * sc
  const sy = (y) => oy + (wT - y) * sc

  g.fillStyle = PAPER
  g.fillRect(0, 0, W, H)

  g.save()
  g.beginPath()
  g.rect(ox, oy, MAPW, mapH)
  g.clip()
  g.fillStyle = MAP_BG
  g.fillRect(ox, oy, MAPW, mapH)

  if (input.aerialImage && aerialGeoref) {
    g.drawImage(
      input.aerialImage,
      sx(aerialGeoref.wL), sy(aerialGeoref.wT),
      (aerialGeoref.wR - aerialGeoref.wL) * sc,
      (aerialGeoref.wT - aerialGeoref.wB) * sc,
    )
  }

  const extents = input.designExtents
  if (extents?.rings?.length) {
    const tracePath = () => {
      g.beginPath()
      for (const ring of extents.rings) {
        ring.forEach(([x, y], i) => (i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))))
        g.closePath()
      }
    }
    tracePath()
    g.fillStyle = EXTENTS_FILL
    g.fill()
    g.save()
    g.setLineDash([6, 4])
    g.strokeStyle = EXTENTS_EDGE
    g.lineWidth = 2
    tracePath()
    g.stroke()
    g.restore()
  }

  const drawCell = (col, row, fill, edge, lw) => {
    const poly = grid.cellPolygon(col, row)
    const allIn = !boundary || poly.every(([x, y]) => pointInPoly(x, y, boundary))
    if (!allIn && boundary) {
      if (keptFraction(poly, boundary) === 0) return
      g.save()
      g.beginPath()
      boundary.forEach(([x, y], i) => (i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))))
      g.closePath()
      g.clip()
    }
    g.beginPath()
    poly.forEach(([x, y], i) => (i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))))
    g.closePath()
    if (fill) {
      g.fillStyle = fill
      g.fill()
    }
    g.strokeStyle = edge
    g.lineWidth = lw
    g.stroke()
    if (!allIn && boundary) g.restore()
  }

  const covered = input.cellFills
  for (const [c, r] of grid.grid.cells) {
    if (!covered.has(cellKey(c, r))) drawCell(c, r, null, GRID_EDGE, 0.4)
  }

  for (const [key, col] of covered) {
    const [c, r] = key.split(',').map(Number)
    drawCell(c, r, col, col === DAILY ? DAILY_EDGE : CELL_EDGE, 0.5)
  }

  const ref = input.referenceLines
  if (ref && (ref.segments?.length || ref.labels?.length || ref.emphasis?.length)) {
    const touches = (pts) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const [x, y] of pts) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
      return x1 >= wL && x0 <= wR && y1 >= wB && y0 <= wT
    }
    const path = (seg) => {
      g.beginPath()
      g.moveTo(sx(seg[0][0]), sy(seg[0][1]))
      for (const v of seg.slice(1)) g.lineTo(sx(v[0]), sy(v[1]))
    }
    const segs = (ref.segments ?? []).filter((s) => s.length > 1 && touches(s))
    g.strokeStyle = 'rgba(255,255,255,0.7)'
    g.lineWidth = 3
    for (const seg of segs) { path(seg); g.stroke() }
    g.strokeStyle = 'rgba(20,20,20,0.75)'
    g.lineWidth = 1.2
    for (const seg of segs) { path(seg); g.stroke() }

    const emph = (ref.emphasis ?? []).filter((s2) => s2.length > 1 && touches(s2))
    if (emph.length) {
      g.strokeStyle = 'rgba(255,255,255,0.85)'
      g.lineWidth = 5
      for (const seg of emph) { path(seg); g.stroke() }
      g.strokeStyle = STRUCTURE
      g.lineWidth = 2.6
      for (const seg of emph) { path(seg); g.stroke() }
    }

    g.font = `bold 10px ${FONT}`
    g.textAlign = 'center'
    g.lineJoin = 'round'
    for (const lb of ref.labels ?? []) {
      if (lb.x < wL || lb.x > wR || lb.y < wB || lb.y > wT) continue
      g.strokeStyle = 'rgba(255,255,255,0.85)'
      g.lineWidth = 2.5
      g.strokeText(lb.v, sx(lb.x), sy(lb.y) + 3)
      g.fillStyle = '#1a1a1a'
      g.fillText(lb.v, sx(lb.x), sy(lb.y) + 3)
    }
    g.lineJoin = 'miter'
    g.textAlign = 'left'
  }

  if (boundary) {
    g.strokeStyle = '#ffffff'
    g.lineWidth = 1.8
    g.beginPath()
    boundary.forEach(([x, y], i) => (i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))))
    g.closePath()
    g.stroke()
  }

  const plant = input.plant
  const pose = input.plantPose
  if (plant && pose && plant.parts?.length) {
    const tf = plantTransform(plant, pose)
    const trace = (pts, close) => {
      g.beginPath()
      pts.forEach((v, i) => {
        const [x, y] = tf(v)
        return i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))
      })
      if (close) g.closePath()
    }
    const span = (pts) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const [x, y] of pts) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
      return (x1 - x0) * (y1 - y0)
    }
    for (const kind of ['hull', 'mats', 'machine']) {
      const set = plant.parts.filter((pt) => pt.kind === kind && pt.closed)
      set.sort((a, b) => span(b.pts) - span(a.pts))
      for (const part of set) {
        g.fillStyle = part.color ?? PLANT_FILL[kind]
        trace(part.pts, true)
        g.fill()
        if (kind === 'mats') {
          g.strokeStyle = part.color ?? PLANT_FILL.mats
          g.lineWidth = 1
          g.stroke()
        }
      }
    }
    g.strokeStyle = PLANT_EDGE
    g.lineWidth = 0.6
    for (const part of plant.parts) {
      if (part.kind === 'machine' && Math.sqrt(span(part.pts)) < 3) continue
      trace(part.pts, part.closed)
      g.stroke()
    }
  }
  g.restore()

  if (zoomed) {
    const IN_MAX = 230
    const asp = (site.wR - site.wL) / (site.wT - site.wB)
    let iw = IN_MAX
    let ih = Math.round(IN_MAX / asp)
    if (ih > IN_MAX) { ih = IN_MAX; iw = Math.round(IN_MAX * asp) }
    const ix = ox + MAPW - iw - 12
    const iy = oy + BAND_H + 12
    const isc = iw / (site.wR - site.wL)
    const gx = (x) => ix + (x - site.wL) * isc
    const gy = (y) => iy + (site.wT - y) * isc

    g.save()
    g.beginPath()
    g.rect(ix, iy, iw, ih)
    g.clip()
    g.fillStyle = MAP_BG
    g.fillRect(ix, iy, iw, ih)
    if (input.aerialImage && aerialGeoref) {
      g.drawImage(
        input.aerialImage,
        gx(aerialGeoref.wL), gy(aerialGeoref.wT),
        (aerialGeoref.wR - aerialGeoref.wL) * isc,
        (aerialGeoref.wT - aerialGeoref.wB) * isc,
      )
    }
    if (extents?.rings?.length) {
      g.beginPath()
      for (const ring of extents.rings) {
        ring.forEach(([x, y], i) => (i ? g.lineTo(gx(x), gy(y)) : g.moveTo(gx(x), gy(y))))
        g.closePath()
      }
      g.fillStyle = EXTENTS_FILL
      g.fill()
    }
    for (const [key, col] of covered) {
      const [c, r] = key.split(',').map(Number)
      g.fillStyle = col
      g.beginPath()
      grid.cellPolygon(c, r).forEach(([x, y], i) => (i ? g.lineTo(gx(x), gy(y)) : g.moveTo(gx(x), gy(y))))
      g.closePath()
      g.fill()
    }
    if (ref?.segments?.length) {
      g.strokeStyle = 'rgba(255,255,255,0.8)'
      g.lineWidth = 0.6
      for (const seg of ref.segments) {
        g.beginPath()
        g.moveTo(gx(seg[0][0]), gy(seg[0][1]))
        for (const v of seg.slice(1)) g.lineTo(gx(v[0]), gy(v[1]))
        g.stroke()
      }
    }
    g.strokeStyle = '#d22'
    g.lineWidth = 1.5
    g.strokeRect(gx(wL), gy(wT), (wR - wL) * isc, (wT - wB) * isc)
    g.restore()
    g.strokeStyle = '#222'
    g.lineWidth = 1.5
    g.strokeRect(ix, iy, iw, ih)
  }

  g.fillStyle = BAND
  g.fillRect(ox, oy, MAPW, BAND_H)
  g.fillStyle = '#fff'
  g.font = `bold 14px ${FONT}`
  g.textAlign = 'center'
  g.fillText(`Daily Placement Progress Chart - ${input.equipmentLabel}`, ox + MAPW / 2, oy + 16)
  g.textAlign = 'left'

  const split = input.passes
  const rows = split.byLift.length
    ? split.byLift.map((b) => ({ label: b.label, first: b.firstPassSqFt, second: b.secondPassSqFt }))
    : [{ label: '(no lift recorded)', first: split.firstPassSqFt, second: split.secondPassSqFt }]
  if (rows.length > 1) {
    rows.push({ label: 'Total', first: split.firstPassSqFt, second: split.secondPassSqFt, bold: true })
  }
  const boxW = 262
  const headH = 30
  const rowH = 15
  const padX = 8
  const boxH = headH + rows.length * rowH + 6
  const bx = zoomed ? ox + 12 : ox + MAPW - boxW - 12
  const by = oy + BAND_H + 12
  g.fillStyle = 'rgba(255,255,255,0.92)'
  g.fillRect(bx, by, boxW, boxH)
  g.strokeStyle = '#666'
  g.lineWidth = 1
  g.strokeRect(bx, by, boxW, boxH)
  g.fillStyle = '#000'
  g.font = `bold 11px ${FONT}`
  g.fillText('Daily Coverage (sq ft)', bx + padX, by + 15)
  const col2 = bx + boxW - padX - 66
  const col3 = bx + boxW - padX
  g.font = `bold 9px ${FONT}`
  g.fillText('Lift', bx + padX, by + 27)
  g.textAlign = 'right'
  g.fillText('1st Pass', col2, by + 27)
  g.fillText('2nd Pass', col3, by + 27)
  const labelMaxW = boxW - padX * 2 - 140
  rows.forEach((r, i) => {
    const y = by + headH + i * rowH + 9
    g.font = `${r.bold ? 'bold ' : ''}9px ${FONT}`
    g.textAlign = 'left'
    g.fillText(ellipsize(g, r.label, labelMaxW), bx + padX, y)
    g.textAlign = 'right'
    g.fillText(Math.round(r.first).toLocaleString(), col2, y)
    g.fillText(r.second ? Math.round(r.second).toLocaleString() : '—', col3, y)
  })
  g.textAlign = 'left'

  g.strokeStyle = '#000'
  g.lineWidth = 2
  g.strokeRect(ox, oy, MAPW, mapH)

  if (input.logoImage) {
    const lw = 210
    g.drawImage(input.logoImage, SIDE, 12, lw, (lw * input.logoImage.height) / input.logoImage.width)
  }
  const [yr, mo, da] = input.dateISO.split('-')
  g.fillStyle = '#000'
  g.font = `bold 16px ${FONT}`
  g.fillText(`Project: ${input.projectTitle}`, SIDE + 250, 36)
  g.font = `bold 24px ${FONT}`
  g.textAlign = 'right'
  g.fillText(`${MONTHS[+mo]} ${+da}${ordinal(+da)}, ${yr}`, W - SIDE, 42)
  g.textAlign = 'left'
  g.font = `13px ${FONT}`
  g.fillText(`Area: ${input.areaLabel}`, SIDE, 88)
  g.fillText(
    `Material Placed:  ${input.materials?.length ? input.materials.join(', ') : 'pending layers on events'}`,
    SIDE, 106,
  )

  const lx = SIDE + 330
  const sw = 28
  const sh = 18
  g.font = `bold 14px ${FONT}`
  legend.forEach(([label, col], k) => {
    const x = lx + (k % LEGEND_COLS) * LEGEND_COLW
    const y = LEGEND_Y + Math.floor(k / LEGEND_COLS) * LEGEND_PITCH
    g.fillStyle = col
    g.fillRect(x, y, sw, sh)
    g.strokeStyle = '#000'
    g.lineWidth = 0.75
    g.strokeRect(x, y, sw, sh)
    g.fillStyle = '#000'
    g.fillText(ellipsize(g, label, LEGEND_COLW - sw - 16), x + sw + 8, y + 14)
  })

  const fy2 = oy + mapH + 30
  const barPx = 300 * sc
  g.fillStyle = '#fff'
  g.fillRect(SIDE, fy2, barPx, 10)
  g.strokeStyle = '#000'
  g.lineWidth = 1
  g.strokeRect(SIDE, fy2, barPx, 10)
  g.fillStyle = '#000'
  g.fillRect(SIDE, fy2, barPx / 2, 10)
  g.font = `12px ${FONT}`
  g.textAlign = 'center'
  for (const v of [0, 150, 300]) g.fillText(String(v), SIDE + (v / 300) * barPx, fy2 + 24)
  g.textAlign = 'left'
  g.fillText('Feet', SIDE + barPx + 14, fy2 + 9)

  if (input.northImage) {
    const nh = 44
    const nw = (nh * input.northImage.width) / input.northImage.height
    g.drawImage(input.northImage, W - SIDE - nw, fy2 - 12, nw, nh)
  }

  g.strokeStyle = '#000'
  g.lineWidth = 3
  g.strokeRect(1.5, 1.5, W - 3, H - 3)

  return { width: W, height: H, view: { ox, oy, mapH, wL, wT, sc } }
}
