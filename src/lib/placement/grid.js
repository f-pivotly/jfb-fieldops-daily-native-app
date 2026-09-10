export const cellKey = (col, row) => `${col},${row}`

export function prepareGrid(grid) {
  const { cellFt, originU, originV } = grid
  const th = (-grid.rotationDeg * Math.PI) / 180
  const c = Math.cos(th)
  const s = Math.sin(th)
  const toGrid = (x, y) => [x * c - y * s, x * s + y * c]
  const ci = Math.cos(-th)
  const si = Math.sin(-th)
  const toWorld = (u, v) => [u * ci - v * si, u * si + v * ci]

  const present = new Set(grid.cells.map(([col, row]) => cellKey(col, row)))

  const cellAt = (x, y) => {
    const [u, v] = toGrid(x, y)
    return {
      col: Math.round((u - originU) / cellFt),
      row: Math.round((v - originV) / cellFt),
    }
  }

  const cellCentre = (col, row) => toWorld(originU + col * cellFt, originV + row * cellFt)

  const cellPolygon = (col, row) => {
    const h = cellFt / 2
    const u = originU + col * cellFt
    const v = originV + row * cellFt
    return [
      toWorld(u - h, v - h),
      toWorld(u + h, v - h),
      toWorld(u + h, v + h),
      toWorld(u - h, v + h),
    ]
  }

  const offsetFromCentre = (x, y) => {
    const { col, row } = cellAt(x, y)
    const [cx, cy] = cellCentre(col, row)
    return Math.hypot(x - cx, y - cy)
  }

  return {
    grid,
    has: (col, row) => present.has(cellKey(col, row)),
    cellAt,
    cellPolygon,
    cellCentre,
    offsetFromCentre,
    cellCount: grid.cells.length,
    totalSqFt: grid.cells.reduce((a, [col, row]) => a + cellSqFt(cellKey(col, row), grid), 0),
  }
}

export function validatePlacementGrid(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('That file is not a placement grid JSON object.')
  const g = (raw)
  const num = (k) => {
    const v = g[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`The grid JSON is missing a numeric "${k}".`)
    return v
  }
  const cellFt = num('cellFt')
  if (cellFt <= 0) throw new Error('The grid JSON\'s "cellFt" must be greater than zero.')
  const rotationDeg = num('rotationDeg')
  const originU = num('originU')
  const originV = num('originV')
  if (!Array.isArray(g.cells) || g.cells.length === 0) {
    throw new Error('The grid JSON has no "cells" -- it needs the list of [col,row] pairs that exist.')
  }
  const cells = g.cells.map((c, i) => {
    if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) {
      throw new Error(`The grid JSON's cell ${i} is not a [col,row] pair.`)
    }
    return [Number(c[0]), Number(c[1])]
  })
  const ring = (pts) => pts
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => [Number(p[0]), Number(p[1])])
  const boundary = Array.isArray(g.boundary) && g.boundary.length >= 3 ? ring(g.boundary) : null
  let partials
  if (g.partials && typeof g.partials === 'object') {
    partials = {}
    for (const [k, v] of Object.entries(g.partials)) {
      if (!v || typeof v !== 'object' || !Number.isFinite(v.sf)) continue
      partials[k] = { sf: Number(v.sf), rings: (Array.isArray(v.rings) ? v.rings : []).map(ring) }
    }
  }
  return {
    label: typeof g.label === 'string' && g.label.trim() ? g.label.trim() : 'Bucket grid',
    ...(typeof g.source === 'string' ? { source: g.source } : {}),
    cellFt,
    rotationDeg,
    originU,
    originV,
    cells,
    boundary,
    ...(partials ? { partials } : {}),
  }
}

function cellSqFt(key, grid) {
  const p = grid.partials?.[key]
  return p ? p.sf : grid.cellFt * grid.cellFt
}

export function sqFtForCellKeys(cells, grid) {
  let sf = 0
  for (const k of cells) sf += cellSqFt(k, grid)
  return sf
}
