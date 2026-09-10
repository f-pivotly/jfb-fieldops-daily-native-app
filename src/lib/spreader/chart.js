import { ringArea, ordinal } from '../dredge/coverage'

const FONT = 'Arial, "Segoe UI", sans-serif'
const NAVY = '#1F3A63'
const PAPER = '#ffffff'
const MAP_BG = '#9aa6ac'
const MINT = '#BEFFE8'
const FIRST_TODATE = '#00A9E6'
const FIRST_DAILY = '#779C5D'
const SECOND_TODATE = '#FFBEE8'
const SECOND_DAILY = '#F5F570'

const MAPW = 1000
const SIDE = 30
const HEADERH = 196
const FOOTERH = 76
const SEAL_FT = 3

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const liftIndex = (layerId, order) => {
  const i = order.indexOf(layerId)
  return i < 0 ? 0 : i
}
const dailyColor = (idx) => (idx % 2 === 0 ? FIRST_DAILY : SECOND_DAILY)
const toDateColor = (idx) => (idx % 2 === 0 ? FIRST_TODATE : SECOND_TODATE)

function labelPoint(rings) {
  let best = rings[0]
  let bestA = 0
  for (const r of rings) {
    const a = ringArea(r)
    if (a > bestA) {
      bestA = a
      best = r
    }
  }
  let cx = 0
  let cy = 0
  for (const [x, y] of best) {
    cx += x
    cy += y
  }
  return [cx / best.length, cy / best.length]
}

export async function renderSpreaderChart(canvas, input) {
  let minx = Infinity
  let miny = Infinity
  let maxx = -Infinity
  let maxy = -Infinity
  for (const b of input.boundaries)
    for (const r of b.rings)
      for (const [x, y] of r) {
        if (x < minx) minx = x
        if (x > maxx) maxx = x
        if (y < miny) miny = y
        if (y > maxy) maxy = y
      }
  if (!isFinite(minx)) throw new Error('Spreader chart: the config has no subarea boundaries to draw.')

  const mg = 0.2 * Math.max(maxx - minx, maxy - miny)
  const gr = { wL: minx - mg, wR: maxx + mg, wT: maxy + mg, wB: miny - mg }
  const mapH = Math.round((MAPW * (gr.wT - gr.wB)) / (gr.wR - gr.wL))
  const W = MAPW + SIDE * 2
  const H = HEADERH + mapH + FOOTERH
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Could not get a 2D canvas context.')

  const ox = SIDE
  const oy = HEADERH
  const sc = MAPW / (gr.wR - gr.wL)
  const sx = (x) => ox + (x - gr.wL) * sc
  const sy = (y) => oy + (gr.wT - y) * sc

  g.fillStyle = PAPER
  g.fillRect(0, 0, W, H)

  const pathRings = (rings) => {
    g.beginPath()
    for (const r of rings) r.forEach(([x, y], i) => (i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))))
    g.closePath()
  }
  const fillCov = (cov, color) => {
    g.lineJoin = 'round'
    g.lineCap = 'round'
    g.lineWidth = SEAL_FT * sc
    for (const c of cov) {
      if (!c.polys.length) continue
      const col = color(liftIndex(c.layerId, input.layerOrder))
      g.fillStyle = col
      g.strokeStyle = col
      pathRings(c.polys)
      g.fill()
      g.stroke()
    }
  }

  g.save()
  g.beginPath()
  g.rect(ox, oy, MAPW, mapH)
  g.clip()
  g.fillStyle = MAP_BG
  g.fillRect(ox, oy, MAPW, mapH)

  const AG = input.aerialGeoref ?? null
  const aerial = input.aerialImage ?? null
  if (aerial && AG) {
    g.drawImage(aerial, sx(AG.wL), sy(AG.wT), (AG.wR - AG.wL) * sc, (AG.wT - AG.wB) * sc)
  }

  g.globalAlpha = 0.82
  for (const b of input.boundaries) {
    g.fillStyle = MINT
    pathRings(b.rings)
    g.fill()
  }
  g.globalAlpha = 0.95
  g.save()
  pathRings(input.boundaries.flatMap((b) => b.rings))
  g.clip()
  fillCov(input.priorCoverage, toDateColor)
  fillCov(input.todayCoverage, dailyColor)
  g.restore()
  g.globalAlpha = 1

  g.strokeStyle = '#111'
  g.lineWidth = 1.5
  for (const b of input.boundaries) {
    pathRings(b.rings)
    g.stroke()
  }
  g.fillStyle = '#000'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const b of input.boundaries) {
    const [lx0, ly0] = labelPoint(b.rings)
    g.font = `bold ${b.area.length > 4 ? 15 : 20}px ${FONT}`
    g.fillText(b.area, sx(lx0), sy(ly0))
  }
  g.restore()
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'

  if (aerial && AG) {
    const iw = 190
    const ih = Math.round((iw * (AG.wT - AG.wB)) / (AG.wR - AG.wL))
    const ihClip = Math.min(ih, mapH - 24)
    const ix = ox + MAPW - iw - 12
    const iy = oy + 12
    g.save()
    g.beginPath()
    g.rect(ix, iy, iw, ihClip)
    g.clip()
    g.drawImage(aerial, ix, iy, iw, ih)
    const ex = (x) => ix + ((x - AG.wL) / (AG.wR - AG.wL)) * iw
    const ey = (y) => iy + ((AG.wT - y) / (AG.wT - AG.wB)) * ih
    g.strokeStyle = '#d22'
    g.lineWidth = 1.6
    g.strokeRect(
      ex(minx) - 3,
      ey(maxy) - 3,
      ((maxx - minx) / (AG.wR - AG.wL)) * iw + 6,
      ((maxy - miny) / (AG.wT - AG.wB)) * ih + 6,
    )
    g.restore()
    g.strokeStyle = '#000'
    g.lineWidth = 1
    g.strokeRect(ix, iy, iw, ihClip)
  }

  g.strokeStyle = '#000'
  g.lineWidth = 2
  g.strokeRect(ox, oy, MAPW, mapH)

  if (input.logoImage) {
    const lw = 230
    g.drawImage(input.logoImage, SIDE, 10, lw, (lw * input.logoImage.height) / input.logoImage.width)
  }
  const [yr, mo, da] = String(input.dateISO ?? '').split('-')
  g.fillStyle = '#000'
  g.font = `bold 22px ${FONT}`
  g.textAlign = 'right'
  g.fillText(`${MONTHS[+mo] ?? ''} ${+da}${ordinal(+da)}, ${yr}`, W - SIDE, 34)
  g.textAlign = 'left'
  g.font = `bold 13px ${FONT}`
  g.fillText('Project:', SIDE, 96)
  g.font = `13px ${FONT}`
  g.fillText(input.projectTitle, SIDE + 52, 96)
  g.font = `bold 13px ${FONT}`
  g.fillText('Project #:', SIDE, 116)
  g.font = `13px ${FONT}`
  g.fillText(input.projectNumber, SIDE + 62, 116)
  g.font = `bold 13px ${FONT}`
  g.fillText('Notes:', SIDE, 136)
  g.font = `13px ${FONT}`
  g.fillText(input.notes || 'Daily Cap Placement Progress', SIDE + 44, 136)
  g.font = `bold 13px ${FONT}`
  g.fillText('Area:', SIDE + 430, 136)
  g.font = `13px ${FONT}`
  g.fillText(input.areaLabel, SIDE + 470, 136)

  const leg = [
    ['Daily First Lift Progress', FIRST_DAILY],
    ['Daily Second Pass Progress', SECOND_DAILY],
    ['First Lift Progress to Date', FIRST_TODATE],
    ['Second Pass Progress to Date', SECOND_TODATE],
    [input.extentsLabel || 'Cap Extents', MINT],
  ]
  const lx = W - SIDE - 300
  let ly = 52
  const sw = 26
  const sh = 15
  g.font = `bold 12px ${FONT}`
  for (const [label, col] of leg) {
    g.fillStyle = col
    g.fillRect(lx, ly, sw, sh)
    g.strokeStyle = '#000'
    g.lineWidth = 0.75
    g.strokeRect(lx, ly, sw, sh)
    g.fillStyle = '#000'
    g.fillText(label, lx + sw + 8, ly + 12)
    ly += 22
  }

  const barY = HEADERH - 28
  const barH = 26
  g.fillStyle = NAVY
  g.fillRect(SIDE, barY, MAPW, barH)
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const title = `Spreader ${input.spreaderName} Daily Progress Chart - ${input.areaLabel}${input.layerTitle ? ' - ' + input.layerTitle : ''}`
  g.font = `bold 18px ${FONT}`
  g.fillText(title, SIDE + MAPW / 2, barY + barH / 2 + 1)
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'

  const fy = oy + mapH + 30
  const barPx = 200 * sc
  g.fillStyle = '#fff'
  g.fillRect(SIDE, fy, barPx, 10)
  g.strokeStyle = '#000'
  g.lineWidth = 1
  g.strokeRect(SIDE, fy, barPx, 10)
  g.fillStyle = '#000'
  g.fillRect(SIDE, fy, barPx / 2, 10)
  g.font = `12px ${FONT}`
  g.textAlign = 'center'
  ;[0, 100, 200].forEach((v) => g.fillText(String(v), SIDE + (v / 200) * barPx, fy + 24))
  g.textAlign = 'left'
  g.fillText('Feet', SIDE + barPx + 14, fy + 9)

  if (input.northImage) {
    const nh = 44
    const nw = (nh * input.northImage.width) / input.northImage.height
    g.drawImage(input.northImage, W - SIDE - nw, fy - 14, nw, nh)
  } else {
    const nx = W - SIDE - 20
    g.strokeStyle = '#000'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(nx, fy + 18)
    g.lineTo(nx, fy - 16)
    g.stroke()
    g.beginPath()
    g.moveTo(nx, fy - 20)
    g.lineTo(nx - 5, fy - 10)
    g.lineTo(nx + 5, fy - 10)
    g.closePath()
    g.fill()
    g.font = `bold 12px ${FONT}`
    g.textAlign = 'center'
    g.fillText('N', nx, fy - 24)
    g.textAlign = 'left'
  }

  g.strokeStyle = '#000'
  g.lineWidth = 3
  g.strokeRect(1.5, 1.5, W - 3, H - 3)

  const sfOf = (cov) => cov.reduce((s, c) => s + c.sqFt, 0)
  return {
    width: W,
    height: H,
    todaySqFt: Math.round(sfOf(input.todayCoverage)),
    toDateSqFt: Math.round(sfOf(input.priorCoverage) + sfOf(input.todayCoverage)),
  }
}
