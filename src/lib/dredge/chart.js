import { makeGrid, coverageMask, rasterizePolys, maskToPolys, ringArea, component, open, dilate, distTransform, finalHeading, pointInPoly, ordinal } from './coverage'
import { prismVolume } from './designVolume'

const COL = { pass1: '#e0852a', pass2: '#8a8a2a', residual: '#b3b3b3', progress: '#c4d99a', band: '#16314b', paper: '#fff', map: '#9aa6ac' }
const FONT = 'Arial, "Segoe UI", sans-serif'
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function parseDredge(txt) {
  const raw = txt.split(/\r?\n/); const pr = []
  for (let i = 0; i + 1 < raw.length; i += 2) pr.push([raw[i].trim(), raw[i + 1]])
  const polys = []; let circle

  const scanEntities = (start, terminators) => {
    const out = []
    const inserts = []
    let localCircle = null
    let i = start
    for (; i < pr.length; i++) {
      const code = pr[i][0], val = (pr[i][1] || '').trim()
      if (code !== '0') continue
      if (terminators.includes(val)) break
      if (val === 'LWPOLYLINE') {
        const v = []; let flag = 0; let j = i + 1
        for (; j < pr.length && pr[j][0] !== '0'; j++) { const [c, vv] = pr[j]; if (c === '10') v.push([parseFloat(vv), NaN]); else if (c === '20' && v.length) v[v.length - 1][1] = parseFloat(vv); else if (c === '70') flag = parseInt(vv, 10) || 0 }
        const pts = v.filter((p) => isFinite(p[1]))
        const closed = pts.length > 2 && (((flag & 1) === 1)
          || Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5)
        if (pts.length > 1) out.push({ pts, closed })
        i = j - 1
      } else if (val === 'LINE') {
        let x0 = NaN, y0 = NaN, x1 = NaN, y1 = NaN, j = i + 1
        for (; j < pr.length && pr[j][0] !== '0'; j++) { const [c, vv] = pr[j]; if (c === '10') x0 = parseFloat(vv); else if (c === '20') y0 = parseFloat(vv); else if (c === '11') x1 = parseFloat(vv); else if (c === '21') y1 = parseFloat(vv) }
        if (isFinite(x0) && isFinite(y0) && isFinite(x1) && isFinite(y1)) out.push({ pts: [[x0, y0], [x1, y1]], closed: false })
        i = j - 1
      } else if (val === 'CIRCLE') {
        let cx = NaN, cy = NaN, j = i + 1
        for (; j < pr.length && pr[j][0] !== '0'; j++) { const [c, vv] = pr[j]; if (c === '10') cx = parseFloat(vv); else if (c === '20') cy = parseFloat(vv) }
        if (isFinite(cx) && isFinite(cy)) localCircle = { x: cx, y: cy }; i = j - 1
      } else if (val === 'INSERT') {
        let name = '', x = NaN, y = NaN, sxc = 1, syc = 1, rot = 0, j = i + 1
        for (; j < pr.length && pr[j][0] !== '0'; j++) { const [c, vv] = pr[j]; if (c === '2') name = vv.trim(); else if (c === '10') x = parseFloat(vv); else if (c === '20') y = parseFloat(vv); else if (c === '41') sxc = parseFloat(vv); else if (c === '42') syc = parseFloat(vv); else if (c === '50') rot = parseFloat(vv) }
        if (name && isFinite(x) && isFinite(y)) inserts.push({ name, x, y, sx: sxc || 1, sy: syc || 1, rotDeg: rot || 0 })
        i = j - 1
      }
    }
    return { out, inserts, localCircle, end: i }
  }

  const blocks = new Map()
  let i = 0
  while (i < pr.length && !(pr[i][0] === '2' && pr[i][1].trim() === 'BLOCKS')) i++
  if (i < pr.length) {
    for (; i < pr.length; i++) {
      const code = pr[i][0], val = (pr[i][1] || '').trim()
      if (code === '0' && val === 'ENDSEC') break
      if (code === '0' && val === 'BLOCK') {
        let name = ''; let j = i + 1
        for (; j < pr.length && pr[j][0] !== '0'; j++) if (pr[j][0] === '2') name = pr[j][1].trim()
        const r = scanEntities(j, ['ENDBLK'])
        if (name) blocks.set(name, r.out)
        i = r.end
      }
    }
  }

  i = 0
  while (i < pr.length && !(pr[i][0] === '2' && pr[i][1].trim() === 'ENTITIES')) i++
  const ents = scanEntities(i + 1, ['ENDSEC'])
  polys.push(...ents.out)
  circle = ents.localCircle
  for (const ins of ents.inserts) {
    const body = blocks.get(ins.name)
    if (!body || !body.length) continue
    const r = (ins.rotDeg * Math.PI) / 180, cosR = Math.cos(r), sinR = Math.sin(r)
    const tf = ([x, y]) => {
      const lx = x * ins.sx, ly = y * ins.sy
      return [ins.x + lx * cosR - ly * sinR, ins.y + lx * sinR + ly * cosR]
    }
    for (const p of body) polys.push({ pts: p.pts.map(tf), closed: p.closed, src: ins.name.toLowerCase() })
  }
  return { polys, circle }
}

function chainOpenPolys(input) {
  const polys = input.map((p) => ({ pts: [...p.pts], closed: p.closed, src: p.src }))
  const TOL = 0.25
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= TOL
  let merged = true
  while (merged) {
    merged = false
    outer: for (let a = 0; a < polys.length; a++) {
      const A = polys[a]; if (A.closed) continue
      for (let b = 0; b < polys.length; b++) {
        if (a === b) continue
        const B = polys[b]; if (B.closed) continue
        const aEnd = A.pts[A.pts.length - 1]
        let joined = null
        if (near(aEnd, B.pts[0])) joined = A.pts.concat(B.pts.slice(1))
        else if (near(aEnd, B.pts[B.pts.length - 1])) joined = A.pts.concat([...B.pts].reverse().slice(1))
        else if (near(A.pts[0], B.pts[B.pts.length - 1])) joined = B.pts.concat(A.pts.slice(1))
        else if (near(A.pts[0], B.pts[0])) joined = [...A.pts].reverse().concat(B.pts.slice(1))
        if (joined) {
          const closed = joined.length > 3 && near(joined[0], joined[joined.length - 1])
          polys[a] = { pts: closed ? joined.slice(0, -1) : joined, closed, src: A.src ?? B.src }
          polys.splice(b, 1)
          merged = true; break outer
        }
      }
    }
  }
  return polys
}

function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f
  }
  if (Math.abs(a) < 1e-6) { let sx = 0, sy = 0; for (const p of ring) { sx += p[0]; sy += p[1] } return [sx / ring.length, sy / ring.length] }
  a *= 0.5; return [cx / (6 * a), cy / (6 * a)]
}

export function parseDxfPolylines(txt) {
  const raw = txt.split(/\r?\n/); const pr = []
  for (let i = 0; i + 1 < raw.length; i += 2) pr.push([raw[i].trim(), raw[i + 1]])
  const polys = []; let i = 0
  while (i < pr.length && !(pr[i][0] === '2' && pr[i][1].trim() === 'ENTITIES')) i++
  for (; i < pr.length; i++) {
    const tag = (pr[i][1] || '').trim()
    if (pr[i][0] === '0' && tag === 'LWPOLYLINE') {
      const v = []; let j = i + 1
      for (; j < pr.length && pr[j][0] !== '0'; j++) { const [c, vv] = pr[j]; if (c === '10') v.push([parseFloat(vv), NaN]); else if (c === '20' && v.length) v[v.length - 1][1] = parseFloat(vv) }
      const ring = v.filter((p) => isFinite(p[1])); if (ring.length > 2) polys.push(ring); i = j - 1
    } else if (pr[i][0] === '0' && tag === 'POLYLINE') {
      const v = []; let j = i + 1
      for (; j < pr.length; j++) {
        if (pr[j][0] === '0') { const t = (pr[j][1] || '').trim(); if (t === 'SEQEND') { j++; break } if (t === 'VERTEX') v.push([NaN, NaN]) }
        else if (v.length) { if (pr[j][0] === '10') v[v.length - 1][0] = parseFloat(pr[j][1]); else if (pr[j][0] === '20') v[v.length - 1][1] = parseFloat(pr[j][1]) }
      }
      const ring = v.filter((p) => isFinite(p[0]) && isFinite(p[1])); if (ring.length > 2) polys.push(ring); i = j - 1
    }
  }
  const ringMag = (r) => Math.max(...r.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))))
  const worldMax = polys.length ? Math.max(...polys.map(ringMag)) : 0
  const world = worldMax > 100000 ? polys.filter((r) => ringMag(r) > worldMax / 100) : polys
  return world.filter((r) => Math.abs(ringArea(r)) >= 25)
}

export function parseCells(txt) {
  const raw = txt.split(/\r?\n/); const pr = []
  for (let i = 0; i + 1 < raw.length; i += 2) pr.push([raw[i].trim(), raw[i + 1]])
  const rings = []; const texts = []
  let i = 0; while (i < pr.length && !(pr[i][0] === '2' && pr[i][1].trim() === 'ENTITIES')) i++
  for (; i < pr.length; i++) {
    const code = pr[i][0], val = (pr[i][1] || '').trim()
    if (code === '0' && val === 'LWPOLYLINE') {
      const v = []; let flag = 0; let j = i + 1
      for (; j < pr.length && pr[j][0] !== '0'; j++) { const [c, vv] = pr[j]; if (c === '10') v.push([parseFloat(vv), NaN]); else if (c === '20' && v.length) v[v.length - 1][1] = parseFloat(vv); else if (c === '70') flag = parseInt(vv, 10) || 0 }
      const ring = v.filter((p) => isFinite(p[1]))
      const closes = ring.length > 2 && ((flag & 1) === 1
        || Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1)
      if (closes) rings.push(ring); i = j - 1
    } else if (code === '0' && val === 'POLYLINE') {
      const v = []; let j = i + 1
      for (; j < pr.length; j++) {
        if (pr[j][0] === '0') { const t = (pr[j][1] || '').trim(); if (t === 'SEQEND') { j++; break } if (t === 'VERTEX') v.push([NaN, NaN]) }
        else if (v.length) { if (pr[j][0] === '10') v[v.length - 1][0] = parseFloat(pr[j][1]); else if (pr[j][0] === '20') v[v.length - 1][1] = parseFloat(pr[j][1]) }
      }
      const ring = v.filter((p) => isFinite(p[0]) && isFinite(p[1])); if (ring.length > 2) rings.push(ring); i = j - 1
    } else if (code === '0' && (val === 'TEXT' || val === 'MTEXT')) {
      let tx = NaN, ty = NaN, tv = ''; let j = i + 1
      for (; j < pr.length && pr[j][0] !== '0'; j++) { const [c, vv] = pr[j]; if (c === '10') tx = parseFloat(vv); else if (c === '20') ty = parseFloat(vv); else if (c === '1' || c === '3') tv += (vv || '').trim() }
      if (isFinite(tx) && isFinite(ty) && tv) texts.push({ x: tx, y: ty, v: tv })
      i = j - 1
    }
  }
  const mag = (x, y) => Math.max(Math.abs(x), Math.abs(y))
  const ringMag = (r) => Math.max(...r.map(([x, y]) => mag(x, y)))
  const worldMax = rings.length ? Math.max(...rings.map(ringMag)) : 0
  const worldRings = worldMax > 100000 ? rings.filter((r) => ringMag(r) > worldMax / 100) : rings

  const clean = (s) => s.replace(/\\[A-Za-z][^;\\{}]*;?|[{}]/g, '').replace(/[^0-9A-Za-z-]/g, '')
  const labels = new Array(worldRings.length).fill('')
  for (const t of texts) {
    let best = -1, bestArea = Infinity
    for (let k = 0; k < worldRings.length; k++) {
      if (labels[k] || !pointInPoly(t.x, t.y, worldRings[k])) continue
      const a = Math.abs(ringArea(worldRings[k]))
      if (a < bestArea) { bestArea = a; best = k }
    }
    if (best >= 0) labels[best] = clean(t.v)
  }
  return worldRings.map((ring, k) => ({ ring, label: labels[k] }))
}

export function parseReferenceLines(txt) {
  const raw = txt.split(/\r?\n/); const pr = []
  for (let i = 0; i + 1 < raw.length; i += 2) pr.push([raw[i].trim(), raw[i + 1]])
  const segments = []; const labels = []
  let i = 0; while (i < pr.length && !(pr[i][0] === '2' && pr[i][1].trim() === 'ENTITIES')) i++
  for (; i < pr.length; i++) {
    const code = pr[i][0], val = (pr[i][1] || '').trim()
    if (code === '0' && val === 'ENDSEC') break
    if (code === '0' && val === 'LINE') {
      let x0 = NaN, y0 = NaN, x1 = NaN, y1 = NaN, j = i + 1
      for (; j < pr.length && pr[j][0] !== '0'; j++) { const [c, vv] = pr[j]; if (c === '10') x0 = parseFloat(vv); else if (c === '20') y0 = parseFloat(vv); else if (c === '11') x1 = parseFloat(vv); else if (c === '21') y1 = parseFloat(vv) }
      if (isFinite(x0) && isFinite(y0) && isFinite(x1) && isFinite(y1)) segments.push([[x0, y0], [x1, y1]])
      i = j - 1
    } else if (code === '0' && (val === 'LWPOLYLINE' || val === 'POLYLINE')) {
      const v = []; let j = i + 1
      for (; j < pr.length && pr[j][0] !== '0'; j++) { const [c, vv] = pr[j]; if (c === '10') v.push([parseFloat(vv), NaN]); else if (c === '20' && v.length) v[v.length - 1][1] = parseFloat(vv) }
      const seg = v.filter((p) => isFinite(p[1])); if (seg.length > 1) segments.push(seg); i = j - 1
    } else if (code === '0' && (val === 'TEXT' || val === 'MTEXT')) {
      let tx = NaN, ty = NaN, tv = ''; let j = i + 1
      for (; j < pr.length && pr[j][0] !== '0'; j++) { const [c, vv] = pr[j]; if (c === '10') tx = parseFloat(vv); else if (c === '20') ty = parseFloat(vv); else if (c === '1' || c === '3') tv += (vv || '').trim() }
      const clean = tv.replace(/\\[A-Za-z][^;\\{}]*;?|[{}]/g, '').trim()
      if (isFinite(tx) && isFinite(ty) && clean) labels.push({ x: tx, y: ty, v: clean })
      i = j - 1
    }
  }
  return { segments, labels }
}

function clipSegToRect(p, q, minX, minY, maxX, maxY) {
  const dx = q[0] - p[0], dy = q[1] - p[1]
  let t0 = 0, t1 = 1
  const edges = [[-dx, p[0] - minX], [dx, maxX - p[0]], [-dy, p[1] - minY], [dy, maxY - p[1]]]
  for (const [den, num] of edges) {
    if (den === 0) { if (num < 0) return null; continue }
    const t = num / den
    if (den < 0) { if (t > t1) return null; if (t > t0) t0 = t }
    else { if (t < t0) return null; if (t < t1) t1 = t }
  }
  return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]]
}

function anchorRefLabelInView(lb, segments, minX, minY, maxX, maxY, maxDistFt = 600) {
  let best = null, bestD = maxDistFt
  for (const seg of segments) {
    let d = Infinity
    for (const [x, y] of seg) d = Math.min(d, Math.hypot(x - lb.x, y - lb.y))
    if (d >= bestD) continue
    for (let k = 0; k + 1 < seg.length; k++) {
      const c = clipSegToRect(seg[k], seg[k + 1], minX, minY, maxX, maxY)
      if (!c) continue
      best = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2]
      bestD = d
      break
    }
  }
  return best
}

function autoCenterlines(mask, G, minCells = 250) {
  const seen = new Uint8Array(mask.length); const lines = []
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue
    const st = [s]; seen[s] = 1; const cells = []
    while (st.length) {
      const i = st.pop(); cells.push(i); const x = i % G.nx, y = (i / G.nx) | 0
      if (x + 1 < G.nx && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; st.push(i + 1) }
      if (x - 1 >= 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; st.push(i - 1) }
      if (y + 1 < G.ny && mask[i + G.nx] && !seen[i + G.nx]) { seen[i + G.nx] = 1; st.push(i + G.nx) }
      if (y - 1 >= 0 && mask[i - G.nx] && !seen[i - G.nx]) { seen[i - G.nx] = 1; st.push(i - G.nx) }
    }
    if (cells.length < minCells) continue
    let mx = 0, my = 0; for (const i of cells) { mx += i % G.nx; my += (i / G.nx) | 0 } mx /= cells.length; my /= cells.length
    let sxx = 0, sxy = 0, syy = 0; for (const i of cells) { const dx = (i % G.nx) - mx, dy = ((i / G.nx) | 0) - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy }
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, lam = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det))
    let vx = sxy, vy = lam - sxx; if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) { vx = 1; vy = 0 } const vn = Math.hypot(vx, vy) || 1; vx /= vn; vy /= vn
    let tmin = Infinity, tmax = -Infinity; for (const i of cells) { const t = ((i % G.nx) - mx) * vx + ((i / G.nx | 0) - my) * vy; if (t < tmin) tmin = t; if (t > tmax) tmax = t }
    lines.push([
      [G.x0 + (mx + tmin * vx) * G.R, G.y0 + (my + tmin * vy) * G.R],
      [G.x0 + (mx + tmax * vx) * G.R, G.y0 + (my + tmax * vy) * G.R],
    ])
  }
  return lines
}

export function detectClusterWindows(rings, gapFt = 400) {
  const boxes = rings
    .filter((r) => r.length >= 3)
    .map((r) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      return { x0, y0, x1, y1 }
    })
  if (boxes.length < 2) return []
  const parent = boxes.map((_, i) => i)
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])))
  const near = (a, b) =>
    a.x0 - gapFt <= b.x1 && b.x0 - gapFt <= a.x1 && a.y0 - gapFt <= b.y1 && b.y0 - gapFt <= a.y1
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (near(boxes[i], boxes[j])) parent[find(i)] = find(j)
    }
  }
  const groups = new Map()
  for (let i = 0; i < boxes.length; i++) {
    const key = find(i), b = boxes[i], w = groups.get(key)
    if (!w) groups.set(key, { minX: b.x0, minY: b.y0, maxX: b.x1, maxY: b.y1 })
    else { w.minX = Math.min(w.minX, b.x0); w.minY = Math.min(w.minY, b.y0); w.maxX = Math.max(w.maxX, b.x1); w.maxY = Math.max(w.maxY, b.y1) }
  }
  const windows = [...groups.values()]
  if (windows.length < 2) return []
  const PAD = 60
  for (const w of windows) { w.minX -= PAD; w.minY -= PAD; w.maxX += PAD; w.maxY += PAD }
  windows.sort((a, b) => a.minX - b.minX)
  return windows
}

export function renderChart(canvas, input) {
  const {
    todayPts, dateISO, config,
    priorRings = [],
    gapFt = 5,
    excludeRings = [],
    removedAreaSeeds = [],
    secondPassRings = [],
    autoSecondPass = true,
    removedSeeds = [],
    overlapTolFt = 5,
    completedCellLabels = [],
    advanceLines = [],
    autoAdvance = true,
    showAdvanceLine = true,
    closeFt,
    clipToCells = true,
    activeCellLabels = [],
    volume,
    todayCoverageRings = [],
    headings = [],
    dredgeShape = null,
    override = null,
    flipShape = false,
    preview = false,
    viewWindow = null,
    highlightRings = [],
    titleText,
    dateText,
  } = input
  if (!todayPts.length && !todayCoverageRings.length && !preview) {
    throw new Error('No dredging points found in the selected RAW files -- nothing to chart.')
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  if (viewWindow) {
    minX = Math.min(viewWindow.minX, viewWindow.maxX); maxX = Math.max(viewWindow.minX, viewWindow.maxX)
    minY = Math.min(viewWindow.minY, viewWindow.maxY); maxY = Math.max(viewWindow.minY, viewWindow.maxY)
  } else if (todayPts.length || todayCoverageRings.length) {
    for (const [x, y] of todayPts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
    for (const ring of todayCoverageRings) {
      for (const [x, y] of ring) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
    }
  } else {
    const isoFrames = []
    if (config.bgGeoref) isoFrames.push(config.bgGeoref)
    if (config.isopachTiles?.length) isoFrames.push(...config.isopachTiles.map((t) => t.georef))
    for (const f of isoFrames) {
      minX = Math.min(minX, f.wL, f.wR); maxX = Math.max(maxX, f.wL, f.wR)
      minY = Math.min(minY, f.wB, f.wT); maxY = Math.max(maxY, f.wB, f.wT)
    }
    for (const ring of [...priorRings, ...highlightRings]) {
      for (const [x, y] of ring) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
    }
    if (!Number.isFinite(minX)) {
      throw new Error('Nothing to frame yet -- add the isopach georeference and Save, then preview.')
    }
  }
  if (!viewWindow) {
    const pad = 130
    minX -= pad; maxX += pad; minY -= pad; maxY += pad
  }

  const TARGET_MAP_ASPECT = 1.174
  {
    const exX = maxX - minX, exY = maxY - minY
    if (exY / exX < TARGET_MAP_ASPECT) { const a = (exX * TARGET_MAP_ASPECT - exY) / 2; minY -= a; maxY += a }
    else { const a = (exY / TARGET_MAP_ASPECT - exX) / 2; minX -= a; maxX += a }
  }

  const headerH = 118, footerH = 64, side = 24
  const mapW = 1000, mapH = Math.round(mapW * (maxY - minY) / (maxX - minX))
  const W = mapW + side * 2, H = headerH + mapH + footerH
  canvas.width = W; canvas.height = H
  const g = canvas.getContext('2d')
  g.fillStyle = COL.paper; g.fillRect(0, 0, W, H)
  const ox = side, oy = headerH, sc = mapW / (maxX - minX)
  const sx = (x) => ox + (x - minX) * sc
  const sy = (y) => oy + mapH - (y - minY) * sc

  let G = makeGrid(minX, minY, maxX, maxY)
  const MAX_CELLS = 50_000_000
  {
    let R = G.R
    while (Number.isFinite(G.nx * G.ny) && G.nx * G.ny > MAX_CELLS && R < 4) {
      R *= 2
      G = makeGrid(minX, minY, maxX, maxY, R)
    }
  }
  if (!Number.isFinite(G.nx * G.ny) || G.nx * G.ny > MAX_CELLS) {
    throw new Error(`Chart extent too large (${G.nx}x${G.ny} cells) -- coverage coordinates look out of range.`)
  }
  const toGrid = ([x, y]) => [Math.round((x - G.x0) / G.R), Math.round((y - G.y0) / G.R)]

  const rawCells = config.cells ?? []
  const boundaryRings = config.boundaryRings ?? []
  const refOnly = !!config.cellsReferenceOnly && rawCells.length > 0
  const allCells = refOnly ? [] : rawCells
  const refCells = refOnly ? rawCells : []
  const drawnCells = allCells.filter((c) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const [x, y] of c.ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    return x1 >= minX && x0 <= maxX && y1 >= minY && y0 <= maxY
  })

  const todayMask = todayCoverageRings.length ? rasterizePolys(todayCoverageRings, G) : coverageMask(todayPts, G, closeFt)
  if (excludeRings.length) { const ex = rasterizePolys(excludeRings, G); for (let i = 0; i < todayMask.length; i++) if (ex[i]) todayMask[i] = 0 }
  for (const seed of removedAreaSeeds) {
    const [sx0, sy0] = toGrid(seed)
    const comp = component(todayMask, G, sx0, sy0)
    for (let i = 0; i < comp.length; i++) if (comp[i]) todayMask[i] = 0
  }
  const priorMask = rasterizePolys(priorRings, G)
  const highlightMask = rasterizePolys(highlightRings, G)

  const cellsUnion = allCells.length ? rasterizePolys(drawnCells.map((c) => c.ring), G) : null
  if (cellsUnion && clipToCells) {
    for (let i = 0; i < todayMask.length; i++) if (!cellsUnion[i]) { todayMask[i] = 0; priorMask[i] = 0 }
  }
  // Coverage boundary (Fountain Lake channel-border style). Clips TODAY only --
  // the "you can only report area within the channel going forward" rule. Prior
  // coverage is HISTORICAL and stays as it was; a boundary that covers just one
  // work area would otherwise erase every earlier phase from the
  // progress-to-date fill. No boundary -> no clipping, as before.
  if (boundaryRings.length) {
    const boundaryUnion = rasterizePolys(boundaryRings, G)
    for (let i = 0; i < todayMask.length; i++) if (!boundaryUnion[i]) todayMask[i] = 0
  }
  if (activeCellLabels.length && drawnCells.length) {
    const sel = new Set(activeCellLabels)
    const workedUnion = rasterizePolys(drawnCells.filter((c) => sel.has(c.label)).map((c) => c.ring), G)
    for (let i = 0; i < todayMask.length; i++) if (!workedUnion[i]) todayMask[i] = 0
  }

  const overlapMask = new Uint8Array(todayMask.length)
  for (let i = 0; i < overlapMask.length; i++) overlapMask[i] = (todayMask[i] && priorMask[i]) ? 1 : 0
  const tolPix = Math.max(1, Math.round(overlapTolFt / G.R))
  const candidateMask = autoSecondPass ? open(overlapMask, tolPix, G) : new Uint8Array(todayMask.length)
  for (const seed of removedSeeds) {
    const [gx, gy] = toGrid(seed)
    const comp = component(candidateMask, G, gx, gy)
    for (let i = 0; i < comp.length; i++) if (comp[i]) candidateMask[i] = 0
  }
  const completedSet = new Set(completedCellLabels)
  const completedUnion = completedSet.size && rawCells.length
    ? rasterizePolys(rawCells.filter((c) => completedSet.has(c.label)).map((c) => c.ring), G)
    : null
  const residualTodayMask = new Uint8Array(todayMask.length)
  if (completedUnion) for (let i = 0; i < residualTodayMask.length; i++) residualTodayMask[i] = (todayMask[i] && completedUnion[i]) ? 1 : 0
  const manualMask = rasterizePolys(secondPassRings, G)
  const secondTodayMask = new Uint8Array(todayMask.length)
  for (let i = 0; i < secondTodayMask.length; i++) secondTodayMask[i] = (todayMask[i] && (candidateMask[i] || manualMask[i]) && !residualTodayMask[i]) ? 1 : 0
  const firstMask = new Uint8Array(todayMask.length)
  for (let i = 0; i < firstMask.length; i++) firstMask[i] = (todayMask[i] && !priorMask[i] && !secondTodayMask[i] && !residualTodayMask[i]) ? 1 : 0
  const incidentalMask = new Uint8Array(todayMask.length)
  for (let i = 0; i < incidentalMask.length; i++) incidentalMask[i] = (overlapMask[i] && !secondTodayMask[i] && !residualTodayMask[i]) ? 1 : 0

  const rPix = gapFt / G.R
  const bridgeMask = new Uint8Array(todayMask.length)
  const hasToday = todayPts.length > 0 || todayCoverageRings.length > 0
  if (hasToday || highlightRings.length) {
    const allMask = new Uint8Array(todayMask.length)
    for (let i = 0; i < allMask.length; i++) allMask[i] = (todayMask[i] || priorMask[i] || highlightMask[i]) ? 1 : 0
    const dtAll = distTransform(allMask, G)
    const notDilated = new Uint8Array(allMask.length)
    for (let i = 0; i < notDilated.length; i++) notDilated[i] = dtAll[i] <= rPix ? 0 : 1
    const dtNot = distTransform(notDilated, G)
    for (let i = 0; i < bridgeMask.length; i++) bridgeMask[i] = (dtNot[i] > rPix && !todayMask[i] && !priorMask[i]) ? 1 : 0
  }
  const baseMask = new Uint8Array(todayMask.length)
  for (let i = 0; i < baseMask.length; i++) baseMask[i] = (priorMask[i] || bridgeMask[i]) ? 1 : 0
  const tuckPix = Math.max(1, Math.round(1.5 / G.R))
  const progressPolys = maskToPolys(dilate(baseMask, tuckPix, G), G)

  const todayPolys = maskToPolys(firstMask, G)
  const secondPolys = maskToPolys(secondTodayMask, G)
  const residualPolys = maskToPolys(residualTodayMask, G)
  const highlightPolys = maskToPolys(highlightMask, G)
  const footprintPolys = maskToPolys(todayMask, G)

  const cellSqFt = G.R * G.R
  const countArea = (m) => { let c = 0; for (let i = 0; i < m.length; i++) c += m[i]; return c * cellSqFt }

  const rf = volume?.recoveryFactor ?? 0.75
  let grossCy, adjustedCy, meanPrismFt, volumeNoDataSqFt
  if (volume?.mode === 'design-grade') {
    const pv = prismVolume(firstMask, G, volume.ref, volume.designElev, cellSqFt)
    grossCy = Math.round(pv.grossCy * 10) / 10
    adjustedCy = Math.round(pv.grossCy * rf * 10) / 10
    meanPrismFt = Math.round(pv.meanPrismFt * 100) / 100
    volumeNoDataSqFt = Math.round(pv.noDataCells * cellSqFt)
  } else if (volume?.mode === 'surface-diff') {
    const sampleSurf = (s, x, y) => {
      const gx = Math.round(x - s.x0), gy = Math.round(y - s.y0)
      if (gx < 0 || gx >= s.nx || gy < 0 || gy >= s.ny) return NaN
      return s.val[gy * s.nx + gx]
    }
    let cutFt = 0
    for (let i = 0; i < todayMask.length; i++) {
      if (!todayMask[i]) continue
      const gx = i % G.nx, gy = (i / G.nx) | 0
      const wx = G.x0 + gx * G.R, wy = G.y0 + gy * G.R
      const a = sampleSurf(volume.prior, wx, wy), b = sampleSurf(volume.today, wx, wy)
      if (Number.isFinite(a) && Number.isFinite(b) && a > b) cutFt += (a - b) * cellSqFt
    }
    const gross = cutFt / 27
    grossCy = Math.round(gross * 10) / 10
    adjustedCy = Math.round(gross * rf * 10) / 10
  }

  const cellBreakdown = []
  for (const c of drawnCells) {
    const cm = rasterizePolys([c.ring], G)
    let cc = 0, tc = 0, uc = 0, fc = 0, sc2 = 0, cutFtC = 0
    const cellFirstMask = volume?.mode === 'design-grade' ? new Uint8Array(cm.length) : null
    const sampleSurf = volume?.mode === 'surface-diff'
      ? (s, x, y) => {
          const gx = Math.round(x - s.x0), gy = Math.round(y - s.y0)
          if (gx < 0 || gx >= s.nx || gy < 0 || gy >= s.ny) return NaN
          return s.val[gy * s.nx + gx]
        }
      : null
    for (let i = 0; i < cm.length; i++) {
      if (!cm[i]) continue
      cc++
      if (todayMask[i]) tc++
      if (todayMask[i] || priorMask[i]) uc++
      if (firstMask[i]) { fc++; if (cellFirstMask) cellFirstMask[i] = 1 }
      if (secondTodayMask[i]) sc2++
      if (sampleSurf && todayMask[i]) {
        const gx = i % G.nx, gy = (i / G.nx) | 0
        const wx = G.x0 + gx * G.R, wy = G.y0 + gy * G.R
        const a = sampleSurf(volume.prior, wx, wy), b = sampleSurf(volume.today, wx, wy)
        if (Number.isFinite(a) && Number.isFinite(b) && a > b) cutFtC += (a - b) * cellSqFt
      }
    }
    const cellSqFtV = Math.round(cc * cellSqFt), cumSqFtV = Math.round(uc * cellSqFt)
    if (cumSqFtV <= 0) continue
    let grossCyC, adjustedCyC
    if (cellFirstMask) {
      const pv = prismVolume(cellFirstMask, G, volume.ref, volume.designElev, cellSqFt)
      grossCyC = Math.round(pv.grossCy * 10) / 10
      adjustedCyC = Math.round(pv.grossCy * rf * 10) / 10
    } else if (sampleSurf) {
      const grossC = cutFtC / 27
      grossCyC = Math.round(grossC * 10) / 10
      adjustedCyC = Math.round(grossC * rf * 10) / 10
    }
    cellBreakdown.push({
      label: c.label,
      cellSqFt: cellSqFtV,
      todaySqFt: Math.round(tc * cellSqFt),
      firstSqFt: Math.round(fc * cellSqFt),
      secondSqFt: Math.round(sc2 * cellSqFt),
      cumulativeSqFt: cumSqFtV,
      pct: cellSqFtV > 0 ? Math.round((cumSqFtV / cellSqFtV) * 100) : 0,
      workedToday: tc > 0,
      grossCy: grossCyC,
      adjustedCy: adjustedCyC,
    })
  }
  cellBreakdown.sort((a, b) => b.todaySqFt - a.todaySqFt || a.label.localeCompare(b.label, undefined, { numeric: true }))

  const fillPolys = (polys, color) => {
    if (!polys.length) return
    g.fillStyle = color; g.beginPath()
    for (const r of polys) { if (r.length < 2) continue; g.moveTo(sx(r[0][0]), sy(r[0][1])); for (const v of r.slice(1)) g.lineTo(sx(v[0]), sy(v[1])); g.closePath() }
    g.fill('evenodd')
  }

  const drawTiles = (tiles) => {
    for (const t of tiles) {
      const gr = t.georef
      if (!t.image || !gr) continue
      if (gr.wL < maxX && gr.wR > minX && gr.wB < maxY && gr.wT > minY) {
        g.drawImage(t.image, sx(gr.wL), sy(gr.wT), (gr.wR - gr.wL) * sc, (gr.wT - gr.wB) * sc)
      }
    }
  }

  g.save(); g.beginPath(); g.rect(ox, oy, mapW, mapH); g.clip()
  g.fillStyle = COL.map; g.fillRect(ox, oy, mapW, mapH)
  if (config.aerialTiles?.length) {
    drawTiles(config.aerialTiles)
  } else if (config.aerialImage && config.aerialGeoref) {
    const AG = config.aerialGeoref
    g.drawImage(config.aerialImage, sx(AG.wL), sy(AG.wT), (AG.wR - AG.wL) * sc, (AG.wT - AG.wB) * sc)
  }
  if (config.isopachTiles?.length) {
    drawTiles(config.isopachTiles)
  } else if (config.bgImage && config.bgGeoref) {
    const IMG = config.bgGeoref
    g.drawImage(config.bgImage, sx(IMG.wL), sy(IMG.wT), (IMG.wR - IMG.wL) * sc, (IMG.wT - IMG.wB) * sc)
  }
  fillPolys(progressPolys, COL.progress)
  if (highlightPolys.length) fillPolys(highlightPolys, COL.pass1)
  fillPolys(todayPolys, COL.pass1)
  fillPolys(secondPolys, COL.pass2)
  fillPolys(residualPolys, COL.residual)

  if (drawnCells.length) {
    const cellPath = (c) => { g.beginPath(); g.moveTo(sx(c.ring[0][0]), sy(c.ring[0][1])); for (const v of c.ring.slice(1)) g.lineTo(sx(v[0]), sy(v[1])); g.closePath() }
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2.5
    for (const c of drawnCells) { cellPath(c); g.stroke() }
    g.strokeStyle = 'rgba(20,20,20,0.7)'; g.lineWidth = 1
    for (const c of drawnCells) { cellPath(c); g.stroke() }
    g.font = `bold 12px ${FONT}`; g.textAlign = 'center'
    for (const c of drawnCells) {
      if (!c.label) continue
      const [cx, cy] = ringCentroid(c.ring)
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.strokeText(c.label, sx(cx), sy(cy) + 4)
      g.fillStyle = '#111'; g.fillText(c.label, sx(cx), sy(cy) + 4)
    }
    g.textAlign = 'left'
  }

  if (refCells.length) {
    const inView = refCells.filter((c) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const [x, y] of c.ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      return x1 >= minX && x0 <= maxX && y1 >= minY && y0 <= maxY
    })
    const cellPath = (c) => { g.beginPath(); g.moveTo(sx(c.ring[0][0]), sy(c.ring[0][1])); for (const v of c.ring.slice(1)) g.lineTo(sx(v[0]), sy(v[1])); g.closePath() }
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2.5
    for (const c of inView) { cellPath(c); g.stroke() }
    g.strokeStyle = 'rgba(20,20,20,0.7)'; g.lineWidth = 1
    for (const c of inView) { cellPath(c); g.stroke() }
    g.font = `bold 12px ${FONT}`; g.textAlign = 'center'
    for (const c of inView) {
      if (!c.label) continue
      const [cx, cy] = ringCentroid(c.ring)
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.strokeText(c.label, sx(cx), sy(cy) + 4)
      g.fillStyle = '#111'; g.fillText(c.label, sx(cx), sy(cy) + 4)
    }
    g.textAlign = 'left'
  }

  const refLines = config.referenceLines
  if (refLines && (refLines.segments.length || refLines.labels.length)) {
    const inView = (pts) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      return x1 >= minX && x0 <= maxX && y1 >= minY && y0 <= maxY
    }
    const segPath = (seg) => { g.beginPath(); g.moveTo(sx(seg[0][0]), sy(seg[0][1])); for (const v of seg.slice(1)) g.lineTo(sx(v[0]), sy(v[1])) }
    const segs = refLines.segments.filter(inView)
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3
    for (const seg of segs) { segPath(seg); g.stroke() }
    g.strokeStyle = 'rgba(20,20,20,0.75)'; g.lineWidth = 1.2
    for (const seg of segs) { segPath(seg); g.stroke() }
    g.font = `bold 10px ${FONT}`; g.textAlign = 'center'
    for (const lb of refLines.labels) {
      let ax = lb.x, ay = lb.y
      if (lb.x < minX || lb.x > maxX || lb.y < minY || lb.y > maxY) {
        const a = anchorRefLabelInView(lb, refLines.segments, minX, minY, maxX, maxY)
        if (!a) continue
        ax = a[0]; ay = a[1]
      }
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2.5; g.strokeText(lb.v, sx(ax), sy(ay) + 3)
      g.fillStyle = '#1a1a1a'; g.fillText(lb.v, sx(ax), sy(ay) + 3)
    }
    g.textAlign = 'left'
  }

  let dredgePose = null
  if (dredgeShape && dredgeShape.polys.length) {
    const dpoly = dredgeShape.polys, circle = dredgeShape.circle
    let sternRef = circle ? [circle.x, circle.y] : dpoly[0].pts[0]
    let cutterRef = sternRef, md = -1
    for (const p of dpoly) for (const v of p.pts) { const dd = Math.hypot(v[0] - sternRef[0], v[1] - sternRef[1]); if (dd > md) { md = dd; cutterRef = v } }
    const machinePts = dpoly.filter((p) => p.src && !/mat/.test(p.src)).flatMap((p) => p.pts)
    if (machinePts.length) {
      let mx = 0, my = 0; for (const v of machinePts) { mx += v[0]; my += v[1] }
      mx /= machinePts.length; my /= machinePts.length
      if (Math.hypot(mx - sternRef[0], my - sternRef[1]) < Math.hypot(mx - cutterRef[0], my - cutterRef[1])) {
        const t = sternRef; sternRef = cutterRef; cutterRef = t
      }
    }
    if (flipShape) { const t = sternRef; sternRef = cutterRef; cutterRef = t }
    const nativeAng = Math.atan2(sternRef[1] - cutterRef[1], sternRef[0] - cutterRef[0])
    let cutterPt, targetAng
    if (override && override.cutter && override.stern) {
      cutterPt = override.cutter
      targetAng = Math.atan2(override.stern[1] - override.cutter[1], override.stern[0] - override.cutter[0])
    } else if (todayPts.length) {
      const Hh = finalHeading(headings); let cutMath
      if (Hh != null) { targetAng = (90 - Hh) * Math.PI / 180; cutMath = targetAng + Math.PI }
      else {
        let cxm = 0, cym = 0; for (const p of todayPts) { cxm += p[0]; cym += p[1] } cxm /= todayPts.length; cym /= todayPts.length
        const tail = todayPts.slice(-Math.max(1, Math.round(todayPts.length * 0.02)))
        let lxm = 0, lym = 0; for (const p of tail) { lxm += p[0]; lym += p[1] } lxm /= tail.length; lym /= tail.length
        cutMath = Math.atan2(lym - cym, lxm - cxm); targetAng = cutMath + Math.PI
      }
      const cdx = Math.cos(cutMath), cdy = Math.sin(cutMath)
      const proj = todayPts.map((p) => p[0] * cdx + p[1] * cdy)
      const idx = proj.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0])
      const n = Math.max(1, Math.round(todayPts.length * 0.02))
      let hx = 0, hy = 0; for (let k = 0; k < n; k++) { const p = todayPts[idx[k][1]]; hx += p[0]; hy += p[1] }
      cutterPt = [hx / n, hy / n]
    } else {
      cutterPt = null
    }
    if (cutterPt) {
      const rot = targetAng - nativeAng, cosR = Math.cos(rot), sinR = Math.sin(rot)
      const tf = ([x, y]) => { const dx = x - cutterRef[0], dy = y - cutterRef[1]; return [cutterPt[0] + dx * cosR - dy * sinR, cutterPt[1] + dx * sinR + dy * cosR] }
      const path = (pts, close) => { const q0 = tf(pts[0]); g.moveTo(sx(q0[0]), sy(q0[1])); for (const v of pts.slice(1)) { const q = tf(v); g.lineTo(sx(q[0]), sy(q[1])) } if (close) g.closePath() }
      let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity
      for (const p of dpoly) for (const v of p.pts) { if (v[0] < bx0) bx0 = v[0]; if (v[0] > bx1) bx1 = v[0]; if (v[1] < by0) by0 = v[1]; if (v[1] > by1) by1 = v[1] }
      const bboxArea = Math.max(1, (bx1 - bx0) * (by1 - by0))
      const chained = chainOpenPolys(dpoly)
      const bigChained = chained.filter((p) => p.closed).reduce((m, p) => ringArea(p.pts) > ringArea(m ? m.pts : []) ? p : m, null)
      if (bigChained && ringArea(bigChained.pts) >= 0.3 * bboxArea) {
        const closedPolys = chained.filter((p) => p.closed)
        const openPolys = chained.filter((p) => !p.closed)
        const MAT = '#8a6b47', MACHINE = '#e8b800', DETAIL = '#b9c2cc'
        const fillFor = (p) => (!p.src ? DETAIL : /mat/.test(p.src) ? MAT : MACHINE)
        const strokeFor = (p) => (p.src && /mat/.test(p.src) ? '#5f4526' : '#1a1a1a')
        g.fillStyle = '#c0392b'; g.beginPath(); path(bigChained.pts, true); g.fill()
        for (const col of [MAT, DETAIL, MACHINE]) {
          const set = closedPolys.filter((p) => p !== bigChained && fillFor(p) === col)
          if (set.length) { g.fillStyle = col; g.beginPath(); for (const p of set) path(p.pts, true); g.fill('evenodd') }
        }
        for (const col of ['#5f4526', '#1a1a1a']) {
          const strokes = [
            ...closedPolys.map((p) => ({ p, c: true })),
            ...openPolys.map((p) => ({ p, c: false })),
          ].filter(({ p }) => strokeFor(p) === col)
          if (strokes.length) { g.strokeStyle = col; g.lineWidth = 0.9; g.beginPath(); for (const { p, c } of strokes) path(p.pts, c); g.stroke() }
        }
      } else {
        const big = dpoly.reduce((m, p) => ringArea(p.pts) > ringArea(m ? m.pts : []) ? p : m, null)
        g.fillStyle = '#b9c2cc'; g.beginPath(); for (const p of dpoly) path(p.pts, true); g.fill('evenodd')
        if (big) { g.fillStyle = '#c0392b'; g.beginPath(); path(big.pts, true); g.fill() }
        g.strokeStyle = '#1a1a1a'; g.lineWidth = 0.9; g.beginPath(); for (const p of dpoly) path(p.pts, true); g.stroke()
      }
      const sternPt = tf(sternRef)
      dredgePose = { cutter: cutterPt, stern: sternPt, screen: { cutter: [sx(cutterPt[0]), sy(cutterPt[1])], stern: [sx(sternPt[0]), sy(sternPt[1])] } }
    }
  }

  const effAdvance = advanceLines.length ? advanceLines : (autoAdvance ? autoCenterlines(firstMask, G) : [])
  let advanceFt = 0
  for (const line of effAdvance) {
    for (let k = 1; k < line.length; k++) advanceFt += Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1])
  }
  if (effAdvance.length && showAdvanceLine) {
    g.strokeStyle = '#e11'; g.lineWidth = 2.5; g.lineCap = 'round'
    for (const line of effAdvance) {
      if (line.length < 2) continue
      g.beginPath(); g.moveTo(sx(line[0][0]), sy(line[0][1]))
      for (const v of line.slice(1)) g.lineTo(sx(v[0]), sy(v[1]))
      g.stroke()
    }
    g.lineCap = 'butt'
  }
  g.restore()
  g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(ox, oy, mapW, mapH)

  const bar = config.colorbarImage ?? null
  if (bar) {
    const bh = Math.min(260, mapH - 30), bw = bh * bar.width / bar.height, bx2 = ox + 10, by2 = oy + mapH - bh - 12
    g.fillStyle = 'rgba(120,120,120,0.92)'; g.fillRect(bx2 - 6, by2 - 20, bw + 12, bh + 26)
    g.strokeStyle = '#444'; g.lineWidth = 1; g.strokeRect(bx2 - 6, by2 - 20, bw + 12, bh + 26)
    g.fillStyle = '#fff'; g.font = `bold 10px ${FONT}`; g.fillText('Isopach (ft)', bx2 - 2, by2 - 7)
    g.drawImage(bar, bx2, by2, bw, bh)
  }

  g.fillStyle = COL.band; g.fillRect(ox, oy, mapW, 22)
  g.fillStyle = '#fff'; g.font = `bold 14px ${FONT}`; g.textAlign = 'center'
  g.fillText(titleText ?? `Daily Dredge Progress Chart - ${config.dredgeLabel}`, ox + mapW / 2, oy + 16)
  g.textAlign = 'left'

  if (config.logoImage) {
    const lw = 210, lh = lw * config.logoImage.height / config.logoImage.width
    g.drawImage(config.logoImage, side, 12, lw, lh)
  }

  const [yr, mo, da] = dateISO.split('-')
  g.fillStyle = '#000'; g.font = `bold 16px ${FONT}`; g.fillText(`Project: ${config.projectTitle}`, side + 250, 36)
  g.font = `bold 24px ${FONT}`; g.textAlign = 'right'
  g.fillText(dateText ?? `${MONTHS[+mo]} ${+da}${ordinal(+da)}, ${yr}`, W - side, 42)
  g.textAlign = 'left'
  g.font = `13px ${FONT}`
  g.fillText(config.stationText ? `Area: ${config.area}: ${config.stationText}` : `Area: ${config.area}`, side, 88)
  if (config.materials) g.fillText(`Material Encountered:  ${config.materials}`, side, 106)

  const leg = [['1st Pass Dredging', COL.pass1], ['2nd Pass Dredging', COL.pass2], ['Residual Dredging', COL.residual], ['Progress to Date', COL.progress]]
  const lx = side + 280, ly = 70, sw = 28, sh = 18
  g.font = `bold 14px ${FONT}`
  leg.forEach((d, k) => {
    const col = k < 2 ? 0 : 1, row = k % 2, x = lx + col * 330, y = ly + row * 30
    g.fillStyle = d[1]; g.fillRect(x, y - 14, sw, sh)
    g.strokeStyle = '#000'; g.lineWidth = 0.75; g.strokeRect(x, y - 14, sw, sh)
    g.fillStyle = '#000'; g.fillText(d[0], x + sw + 8, y)
  })

  const fy = oy + mapH + 34, barFt = 300, barPx = barFt * sc
  g.fillStyle = '#fff'; g.fillRect(side, fy - 8, barPx, 10)
  g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(side, fy - 8, barPx, 10)
  g.fillStyle = '#000'; g.fillRect(side, fy - 8, barPx / 2, 10)
  g.font = `12px ${FONT}`
  ;[0, 150, 300].forEach((v, k) => { const x = side + (v / 300) * barPx; g.fillText(String(v), x - (k ? 8 : 0), fy + 18) })
  g.fillText('Feet', side + barPx + 14, fy + 2)

  if (config.northImage) {
    const nh = 44, nw = nh * config.northImage.width / config.northImage.height
    g.drawImage(config.northImage, W - side - nw, fy - 26, nw, nh)
  }

  g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3)

  const todaySqFt = Math.round(countArea(firstMask))
  const secondPassSqFt = Math.round(countArea(secondTodayMask))
  const residualSqFt = Math.round(countArea(residualTodayMask))
  const incidentalSqFt = Math.round(countArea(incidentalMask))
  const priorSqFt = Math.round(countArea(priorMask))
  const priorTrueSqFt = Math.round(priorRings.reduce((s, r) => s + Math.abs(ringArea(r)), 0))

  return {
    stats: {
      todaySqFt, secondPassSqFt, residualSqFt, incidentalSqFt, priorSqFt,
      cumulativeSqFt: todaySqFt + priorTrueSqFt,
      advanceFt: Math.round(advanceFt),
      grossCy, adjustedCy, meanPrismFt, volumeNoDataSqFt,
    },
    dredgePose,
    todayRings: todayPolys,
    secondRings: secondPolys,
    footprintRings: footprintPolys,
    cellBreakdown,
    advanceLines: effAdvance,
    transform: { ox, oy, minX, minY, mapH, sc },
  }
}

export function buildProgressDxf(todayPts, priorRings = [], secondPassRings = [], closeFt) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of todayPts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  if (!isFinite(minX)) return '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n'
  minX -= 5; maxX += 5; minY -= 5; maxY += 5
  const G = makeGrid(minX, minY, maxX, maxY)
  const today = coverageMask(todayPts, G, closeFt), prior = rasterizePolys(priorRings, G), flagged = rasterizePolys(secondPassRings, G)
  const first = new Uint8Array(today.length), second = new Uint8Array(today.length)
  for (let i = 0; i < today.length; i++) {
    if (!today[i]) continue
    if (flagged[i]) second[i] = 1
    else if (!prior[i]) first[i] = 1
  }
  const poly = (layer, ring) => {
    let s = `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n1\n`
    for (const [x, y] of ring) s += `0\nVERTEX\n8\n${layer}\n10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n`
    return s + `0\nSEQEND\n8\n${layer}\n`
  }
  let body = ''
  for (const r of maskToPolys(today, G)) body += poly('PROGRESS_TODAY', r)
  for (const r of maskToPolys(first, G)) body += poly('PASS_1ST', r)
  for (const r of maskToPolys(second, G)) body += poly('PASS_2ND', r)
  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n`
    + `9\n$EXTMIN\n10\n${minX.toFixed(3)}\n20\n${minY.toFixed(3)}\n30\n0.0\n`
    + `9\n$EXTMAX\n10\n${maxX.toFixed(3)}\n20\n${maxY.toFixed(3)}\n30\n0.0\n0\nENDSEC\n`
    + `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n4\n`
    + `0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n`
    + `0\nLAYER\n2\nPROGRESS_TODAY\n70\n0\n62\n3\n6\nCONTINUOUS\n`
    + `0\nLAYER\n2\nPASS_1ST\n70\n0\n62\n30\n6\nCONTINUOUS\n`
    + `0\nLAYER\n2\nPASS_2ND\n70\n0\n62\n50\n6\nCONTINUOUS\n`
    + `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`
}

export function buildProgressDxfFromRings(firstRings, secondRings = []) {
  const all = [...firstRings, ...secondRings]
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const r of all) for (const [x, y] of r) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  if (!isFinite(minX)) return '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n'
  minX -= 5; maxX += 5; minY -= 5; maxY += 5
  const poly = (layer, ring) => {
    let s = `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n1\n`
    for (const [x, y] of ring) s += `0\nVERTEX\n8\n${layer}\n10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n`
    return s + `0\nSEQEND\n8\n${layer}\n`
  }
  let body = ''
  for (const r of all) body += poly('PROGRESS_TODAY', r)
  for (const r of firstRings) body += poly('PASS_1ST', r)
  for (const r of secondRings) body += poly('PASS_2ND', r)
  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n`
    + `9\n$EXTMIN\n10\n${minX.toFixed(3)}\n20\n${minY.toFixed(3)}\n30\n0.0\n`
    + `9\n$EXTMAX\n10\n${maxX.toFixed(3)}\n20\n${maxY.toFixed(3)}\n30\n0.0\n0\nENDSEC\n`
    + `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n4\n`
    + `0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n`
    + `0\nLAYER\n2\nPROGRESS_TODAY\n70\n0\n62\n3\n6\nCONTINUOUS\n`
    + `0\nLAYER\n2\nPASS_1ST\n70\n0\n62\n30\n6\nCONTINUOUS\n`
    + `0\nLAYER\n2\nPASS_2ND\n70\n0\n62\n50\n6\nCONTINUOUS\n`
    + `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`
}
