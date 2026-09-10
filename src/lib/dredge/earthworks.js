import { PARAM, close, fillHoles, dropSmallIslands, maskToPolys } from './coverage'
import { sampleRef } from './designVolume'

const EARTHWORKS_DEFAULTS = { minCutFt: 0.25, waterBufferFt: 0.25, designTolFt: 0.5, minIslandSqFt: 0 }

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

const sampleAt = sampleRef

const GRID_PAD = 4

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
  const closeR = Math.max(1, Math.round((opts.closeFt ?? PARAM.CLOSE_R) / G.R))
  const minIsland = opts.minIslandSqFt ?? EARTHWORKS_DEFAULTS.minIslandSqFt
  let m = fillHoles(close(mask, closeR, G), G)
  if (minIsland > 0) m = dropSmallIslands(m, G, Math.round(minIsland / (G.R * G.R)))
  const rings = maskToPolys(m, G, 0)
  return { rings, cutSqFt: cut, swingFilteredSqFt: swing, newCells }
}

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
  const closeR = Math.max(1, Math.round((opts.closeFt ?? PARAM.CLOSE_R) / G.R))
  const minIsland = opts.minIslandSqFt ?? EARTHWORKS_DEFAULTS.minIslandSqFt
  let m = kept ? fillHoles(close(mask, closeR, G), G) : mask
  if (kept && minIsland > 0) m = dropSmallIslands(m, G, Math.round(minIsland / (G.R * G.R)))
  const rings = kept ? maskToPolys(m, G, 0) : []
  return { rings, keptSqFt: kept, swingFilteredSqFt: swing }
}

export function filenameDateISO(name) {
  const m = name.trim().match(/^(\d{2})(\d{2})(\d{2})\b/)
  if (!m) return null
  const [, yy, mm, dd] = m
  const mo = parseInt(mm, 10), da = parseInt(dd, 10)
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null
  return `20${yy}-${mm}-${dd}`
}

const ISO_BINS = [
  { max: -1.5, rgb: [38, 0, 0] },
  { max: -1.0, rgb: [0, 0, 0] },
  { max: -0.5, rgb: [101, 101, 101] },
  { max: -0.25, rgb: [128, 128, 128] },
  { max: 0, rgb: [192, 192, 192] },
  { max: 0.25, rgb: [0, 165, 0] },
  { max: 0.5, rgb: [0, 76, 0] },
  { max: 1, rgb: [0, 38, 0] },
  { max: 2, rgb: [127, 255, 255] },
  { max: 3, rgb: [127, 159, 255] },
  { max: 4, rgb: [82, 82, 165] },
  { max: 5, rgb: [0, 0, 76] },
  { max: 6, rgb: [255, 255, 127] },
  { max: 7, rgb: [255, 223, 127] },
  { max: 8, rgb: [255, 127, 0] },
  { max: 9, rgb: [204, 204, 204] },
  { max: 10, rgb: [255, 127, 191] },
]
function isopachColor(v) {
  for (const b of ISO_BINS) if (v < b.max) return b.rgb
  return [255, 0, 0]
}

export async function isopachCsvToImage(text) {
  const s = parseEarthworksCsv(text)
  const canvas = document.createElement('canvas')
  canvas.width = s.nx; canvas.height = s.ny
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Could not create a canvas to render the isopach.')
  const img = g.createImageData(s.nx, s.ny)
  for (let gy = 0; gy < s.ny; gy++) {
    for (let gx = 0; gx < s.nx; gx++) {
      const v = s.val[gy * s.nx + gx]
      if (Number.isNaN(v)) continue
      const [r, gr, b] = isopachColor(v)
      const o = ((s.ny - 1 - gy) * s.nx + gx) * 4
      img.data[o] = r; img.data[o + 1] = gr; img.data[o + 2] = b; img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Could not render the isopach image.')
  return {
    file: new File([blob], 'isopach.png', { type: 'image/png' }),
    georef: { wL: s.x0 - 0.5, wR: s.x0 + s.nx - 0.5, wT: s.y0 + s.ny - 0.5, wB: s.y0 - 0.5 },
  }
}
