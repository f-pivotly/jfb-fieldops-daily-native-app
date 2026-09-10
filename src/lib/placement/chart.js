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

const LIFT_PALETTE = [
  '#FFFF00', '#00E6A9', '#C500FF', '#FFBEBE', '#9C9C9C', '#FF7F0E',
  '#4FA3FF', '#FFD27F', '#C4A484', '#E31A1C', '#6A3D9A', '#00CED1',
]

export function buildLiftPalette(layers) {
  const ranked = (layers ?? [])
    .filter((l) => l && l.id && l.active !== false)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      || String(a.layer_name ?? '').localeCompare(String(b.layer_name ?? '')))
  const order = new Map()
  const byId = new Map()
  const entries = ranked.map((l, i) => {
    const color = LIFT_PALETTE[i % LIFT_PALETTE.length]
    order.set(l.id, i)
    byId.set(l.id, color)
    return { layerId: l.id, label: l.layer_report_name || l.layer_name || 'Lift', color }
  })
  return { colorFor: (layerId) => (layerId ? byId.get(layerId) ?? null : null), order, entries }
}

function liftOrdinal(l, layerOrder) {
  const byConfig = l.layerId ? layerOrder?.get(l.layerId) : undefined
  return byConfig !== undefined ? byConfig : 1000
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
  for (const l of lifts ?? []) if (l.label && !out.includes(l.label)) out.push(l.label)
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

export function buildCellFills(prior, today, colorFor) {
  const fills = new Map()
  const unrecordedCells = new Set()
  for (const day of prior ?? []) {
    for (const l of day.layers) {
      const col = colorFor(l.layerId || null)
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

  let wL, wR, wT, wB
  if (aerialGeoref) {
    ({ wL, wR, wT, wB } = aerialGeoref)
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
    wL = x0 - pad; wR = x1 + pad; wB = y0 - pad; wT = y1 + pad
  }

  const legend = [
    ...(input.legendLifts ?? []).map((l) => [l.label, l.color]),
    ['Daily Progress (1st Pass)', DAILY],
    ['Daily Progress (2nd Pass)', DAILY_2ND],
  ]
  const legendRows = Math.max(1, Math.ceil(legend.length / LEGEND_COLS))
  const headerH = Math.max(150, LEGEND_Y + (legendRows - 1) * LEGEND_PITCH + 24)

  const mapH = Math.round((MAPW * (wT - wB)) / (wR - wL))
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
  if (ref && (ref.segments?.length || ref.labels?.length)) {
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
    g.font = `bold 10px ${FONT}`
    g.textAlign = 'center'
    for (const lb of ref.labels ?? []) {
      if (lb.x < wL || lb.x > wR || lb.y < wB || lb.y > wT) continue
      g.strokeStyle = 'rgba(255,255,255,0.85)'
      g.lineWidth = 2.5
      g.strokeText(lb.v, sx(lb.x), sy(lb.y) + 3)
      g.fillStyle = '#1a1a1a'
      g.fillText(lb.v, sx(lb.x), sy(lb.y) + 3)
    }
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
  g.restore()

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
  const bx = ox + MAPW - boxW - 12
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

  return { width: W, height: H }
}
