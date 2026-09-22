import { cellKey, sqFtForCellKeys } from './grid'

function pickWindow(secs, windows) {
  if (windows.length === 0) return null
  const containing = windows.filter((w) => secs >= w.fromSecs && secs <= w.toSecs)
  if (containing.length > 0) {
    const productive = containing.find((w) => w.productive)
    return { w: productive ?? containing[0], mode: 'inside' }
  }
  let best = windows[0]
  let bestD = Infinity
  for (const w of windows) {
    const d = Math.min(Math.abs(secs - w.fromSecs), Math.abs(secs - w.toSecs))
    if (d < bestD) { bestD = d; best = w }
  }
  return { w: best, mode: 'nearest' }
}

export function attributeBuckets(placements, grid, windows) {
  const buckets = []
  let outsideGrid = 0
  let snapped = 0
  let unattributed = 0
  let maxOffsetFt = 0

  for (const b of placements ?? []) {
    const { col, row } = grid.cellAt(b.x, b.y)
    const inGrid = grid.has(col, row)
    const offsetFt = grid.offsetFromCentre(b.x, b.y)
    if (offsetFt > maxOffsetFt) maxOffsetFt = offsetFt
    if (!inGrid) outsideGrid++

    const pick = pickWindow(b.secs, windows ?? [])
    if (!pick) unattributed++
    else if (pick.mode === 'nearest') snapped++

    buckets.push({
      bucket: b,
      col,
      row,
      inGrid,
      offsetFt,
      layerId: pick ? pick.w.layerId : null,
      layerName: pick ? pick.w.layerName : null,
      mode: pick ? pick.mode : 'none',
    })
  }

  const byLayer = new Map()
  const allCells = new Set()
  for (const a of buckets) {
    if (!a.inGrid) continue
    const k = cellKey(a.col, a.row)
    allCells.add(k)
    const id = a.layerId ?? ''
    const entry = byLayer.get(id) ?? { name: a.layerName ?? 'Unattributed', cells: new Set(), buckets: 0 }
    entry.cells.add(k)
    entry.buckets++
    byLayer.set(id, entry)
  }

  const layers = [...byLayer.entries()].map(([id, e]) => ({
    layerId: id,
    layerName: e.name,
    cells: [...e.cells].map((k) => k.split(',').map(Number)),
    cellCount: e.cells.size,
    sqFt: sqFtForCellKeys(e.cells, grid.grid),
    bucketCount: e.buckets,
  }))

  return {
    buckets,
    layers,
    distinctCells: allCells.size,
    distinctSqFt: sqFtForCellKeys(allCells, grid.grid),
    outsideGrid,
    snapped,
    unattributed,
    maxOffsetFt,
  }
}

function secsInZone(iso, timeZone) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 0
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone,
  }).formatToParts(d)
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? '0')
  return (get('hour') % 24) * 3600 + get('minute') * 60 + get('second')
}

export function windowsFromActivities(activities, layerNameById, isProductive) {
  const out = []
  for (const a of activities ?? []) {
    if (!a.layer_id || !a.start_date_time || !a.end_date_time) continue
    const from = secsInZone(a.start_date_time, a.timezone)
    const to = secsInZone(a.end_date_time, a.timezone)
    out.push({
      layerId: a.layer_id,
      layerName: layerNameById.get(a.layer_id) ?? '',
      fromSecs: Math.min(from, to),
      toSecs: Math.max(from, to),
      productive: isProductive(a),
    })
  }
  return out.sort((a, b) => a.fromSecs - b.fromSecs)
}

export function attributeHistory(history, grid, activitiesByDate, layerNameById, isProductive) {
  return (history ?? [])
    .slice()
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
    .map(({ reportDate, placements }) => ({
      reportDate,
      coverage: attributeBuckets(
        placements,
        grid,
        windowsFromActivities(activitiesByDate.get(reportDate) ?? [], layerNameById, isProductive),
      ),
    }))
}

export function bucketSqFtForLayer(summary, layerId) {
  if (!layerId) return null
  const hit = summary.layers.find((l) => l.layerId === layerId)
  return hit ? hit.sqFt : null
}

export function layersMissingProductionRows(summary, enteredLayerIds) {
  const entered = new Set((enteredLayerIds ?? []).filter(Boolean))
  return summary.layers.filter((l) => l.layerId && !entered.has(l.layerId) && l.sqFt > 0)
}
