import { fillHoles } from './coverage'

export const ALIGNMENT_SNAP_FT = 5

export function parseAlignmentDxf(txt) {
  const raw = txt.split(/\r?\n/)
  const pr = []
  for (let i = 0; i + 1 < raw.length; i += 2) pr.push([raw[i].trim(), raw[i + 1]])
  const out = []
  let i = 0
  while (i < pr.length && !(pr[i][0] === '2' && (pr[i][1] || '').trim() === 'ENTITIES')) i++
  for (; i < pr.length; i++) {
    if (pr[i][0] !== '0') continue
    const tag = (pr[i][1] || '').trim()
    if (tag === 'LINE') {
      let x1 = NaN, y1 = NaN, x2 = NaN, y2 = NaN, j = i + 1
      for (; j < pr.length && pr[j][0] !== '0'; j++) {
        const [c, v] = pr[j]
        if (c === '10') x1 = parseFloat(v)
        else if (c === '20') y1 = parseFloat(v)
        else if (c === '11') x2 = parseFloat(v)
        else if (c === '21') y2 = parseFloat(v)
      }
      if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) out.push([[x1, y1], [x2, y2]])
      i = j - 1
    } else if (tag === 'LWPOLYLINE') {
      const v = []; let j = i + 1
      for (; j < pr.length && pr[j][0] !== '0'; j++) {
        const [c, vv] = pr[j]
        if (c === '10') v.push([parseFloat(vv), NaN])
        else if (c === '20' && v.length) v[v.length - 1][1] = parseFloat(vv)
      }
      const line = v.filter((p) => isFinite(p[0]) && isFinite(p[1]))
      if (line.length >= 2) out.push(line)
      i = j - 1
    } else if (tag === 'POLYLINE') {
      const v = []; let j = i + 1
      for (; j < pr.length; j++) {
        if (pr[j][0] === '0') {
          const t = (pr[j][1] || '').trim()
          if (t === 'SEQEND') { j++; break }
          if (t === 'VERTEX') v.push([NaN, NaN])
        } else if (v.length) {
          if (pr[j][0] === '10') v[v.length - 1][0] = parseFloat(pr[j][1])
          else if (pr[j][0] === '20') v[v.length - 1][1] = parseFloat(pr[j][1])
        }
      }
      const line = v.filter((p) => isFinite(p[0]) && isFinite(p[1]))
      if (line.length >= 2) out.push(line)
      i = j - 1
    }
  }
  const mag = (l) => Math.max(...l.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))))
  const worldMax = out.length ? Math.max(...out.map(mag)) : 0
  return worldMax > 100000 ? out.filter((l) => mag(l) > worldMax / 100) : out
}

function rasterizeLines(lines, G) {
  const m = new Uint8Array(G.nx * G.ny)
  const put = (gx, gy) => {
    if (gx >= 0 && gx < G.nx && gy >= 0 && gy < G.ny) m[gy * G.nx + gx] = 1
  }
  for (const line of lines) {
    for (let k = 0; k + 1 < line.length; k++) {
      let x0 = Math.round((line[k][0] - G.x0) / G.R)
      let y0 = Math.round((line[k][1] - G.y0) / G.R)
      const x1 = Math.round((line[k + 1][0] - G.x0) / G.R)
      const y1 = Math.round((line[k + 1][1] - G.y0) / G.R)
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
      let err = dx - dy
      if (dx + dy > 10 * (G.nx + G.ny)) continue
      for (;;) {
        put(x0, y0)
        if (x0 === x1 && y0 === y1) break
        const e2 = 2 * err
        if (e2 > -dy) { err -= dy; x0 += sx }
        if (e2 < dx) { err += dx; y0 += sy }
      }
    }
  }
  return m
}

function blocked(ax, ay, bx, by, wall, G) {
  const dx = Math.abs(bx - ax), dy = Math.abs(by - ay)
  const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1
  let err = dx - dy, x = ax, y = ay
  for (;;) {
    if (!(x === ax && y === ay) && !(x === bx && y === by)) {
      if (x >= 0 && x < G.nx && y >= 0 && y < G.ny && wall[y * G.nx + x]) return true
    }
    if (x === bx && y === by) return false
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
  }
}

export function snapToAlignment(mask, G, lines, snapFt) {
  const cellFt = G.R
  const snapCells = snapFt / cellFt
  if (!lines.length || snapCells <= 0) return { mask, addedSqFt: 0 }
  const wall = rasterizeLines(lines, G)

  const rc = Math.ceil(snapCells)
  const dwal = new Float32Array(G.nx * G.ny).fill(Infinity)
  for (let gy = 0; gy < G.ny; gy++) {
    for (let gx = 0; gx < G.nx; gx++) {
      if (!wall[gy * G.nx + gx]) continue
      for (let dy = -rc; dy <= rc; dy++) {
        const y = gy + dy
        if (y < 0 || y >= G.ny) continue
        for (let dx = -rc; dx <= rc; dx++) {
          const x = gx + dx
          if (x < 0 || x >= G.nx) continue
          const d = Math.hypot(dx, dy)
          if (d > snapCells) continue
          const i = y * G.nx + x
          if (d < dwal[i]) dwal[i] = d
        }
      }
    }
  }

  const out = new Uint8Array(mask)
  for (let gy = 0; gy < G.ny; gy++) {
    for (let gx = 0; gx < G.nx; gx++) {
      const i = gy * G.nx + gx
      if (mask[i] || wall[i]) continue
      const dw = dwal[i]
      if (!isFinite(dw)) continue
      const budget = snapCells - dw
      if (budget < 0) continue
      const br = Math.ceil(budget)
      let hit = false
      for (let dy = -br; dy <= br && !hit; dy++) {
        const y = gy + dy
        if (y < 0 || y >= G.ny) continue
        for (let dx = -br; dx <= br; dx++) {
          const x = gx + dx
          if (x < 0 || x >= G.nx) continue
          if (!mask[y * G.nx + x]) continue
          if (Math.hypot(dx, dy) > budget) continue
          if (blocked(gx, gy, x, y, wall, G)) continue
          hit = true; break
        }
      }
      if (hit) out[i] = 1
    }
  }
  const filled = fillHoles(out, G)
  let total = 0
  for (let i = 0; i < filled.length; i++) if (filled[i] && !mask[i]) total++
  return { mask: filled, addedSqFt: total * cellFt * cellFt }
}
