export const PARAM = {
  RES: 0.5, CUT_R: 1.5, CLOSE_R: 2, SIMPLIFY: 1.0, MINAREA: 25, MAX_STEP: 10,
  TRANSIT_FT_S: 2.5, TRANSIT_WIN_S: 1.0,
};

function cutterDevice(text) {
  for (const l of text.split('\n')) {
    const t = l.trim(); if (!t.startsWith('DEV ')) continue;
    const dev = t.split(/\s+/)[1]; const name = (t.match(/"([^"]*)"/) || [])[1] || '';
    if (/Animation Zoom/i.test(name) && /CutterJFB/i.test(t)) return dev;
  }
  return null;
}

export async function readTrack(files, onProgress) {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  if (!sorted.length) return { pts: [], headings: [], device: null };

  const first = await sorted[0].text();
  const cutDev = cutterDevice(first);
  const byDev = {};
  const byDevT = {};
  const headings = [];
  const scan = (text) => {
    for (const line of text.split('\n')) {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'POS') {
        const x = parseFloat(p[3]), y = parseFloat(p[4]), t = parseFloat(p[2]);
        if (isFinite(x) && isFinite(y)) { (byDev[p[1]] ??= []).push([x, y]); (byDevT[p[1]] ??= []).push(t); }
      } else if (p[0] === 'GYR') {
        const v = parseFloat(p[3]); if (isFinite(v)) headings.push(v);
      }
    }
  };
  scan(first);
  for (let i = 1; i < sorted.length; i++) { scan(await sorted[i].text()); onProgress?.(i + 1, sorted.length); }

  const dev = (cutDev != null && byDev[cutDev])
    ? cutDev
    : Object.keys(byDev).sort((a, b) => byDev[b].length - byDev[a].length)[0] ?? null;
  const rawp = dev ? byDev[dev] : [];
  const rawt = dev ? byDevT[dev] : [];
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const fp = []; const ft = [];
  for (let i = 0; i < rawp.length; i++) {
    const pr = i > 0 ? rawp[i - 1] : null, nx = i < rawp.length - 1 ? rawp[i + 1] : null;
    const dp = pr ? d(rawp[i], pr) : 0, dn = nx ? d(rawp[i], nx) : 0;
    const spike = (pr && nx) ? (dp > PARAM.MAX_STEP && dn > PARAM.MAX_STEP)
      : (!pr && nx) ? (dn > PARAM.MAX_STEP)
        : (pr && !nx) ? (dp > PARAM.MAX_STEP) : false;
    if (!spike) { fp.push(rawp[i]); ft.push(rawt[i]); }
  }
  const pts = ft.some((t) => isFinite(t)) ? dropTransit(fp, ft) : fp;
  return { pts, headings, device: dev };
}

function dropTransit(pts, t) {
  const n = pts.length;
  if (n < 3) return pts;
  const WIN = PARAM.TRANSIT_WIN_S, LIM = PARAM.TRANSIT_FT_S;
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const fast = (i, step) => {
    for (let j = i + step; j >= 0 && j < n; j += step) {
      const dt = Math.abs(t[j] - t[i]);
      if (!isFinite(dt) || dt <= 0) return false;
      if (dt >= WIN) return d(pts[i], pts[j]) / dt > LIM;
    }
    return false;
  };
  const out = [];
  for (let i = 0; i < n; i++) if (!(fast(i, 1) || fast(i, -1))) out.push(pts[i]);
  return out;
}

export function finalHeading(headings) {
  if (!headings || !headings.length) return null;
  const t = headings.slice(-200).sort((a, b) => a - b); return t[t.length >> 1];
}

export function makeGrid(minX, minY, maxX, maxY, res) {
  const R = res ?? PARAM.RES;
  const gx0 = Math.floor(minX / R) * R, gy0 = Math.floor(minY / R) * R;
  const nx = Math.ceil((maxX - gx0) / R) + 1, ny = Math.ceil((maxY - gy0) / R) + 1;
  return { x0: gx0, y0: gy0, nx, ny, R };
}
export function rasterize(pts, G) {
  const grid = new Uint8Array(G.nx * G.ny); const r = Math.max(1, Math.round(PARAM.CUT_R / G.R));
  for (const [x, y] of pts) {
    const cx = Math.round((x - G.x0) / G.R), cy = Math.round((y - G.y0) / G.R);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue; const gx = cx + dx, gy = cy + dy;
      if (gx >= 0 && gx < G.nx && gy >= 0 && gy < G.ny) grid[gy * G.nx + gx] = 1;
    }
  }
  return grid;
}
function morph(src, r, dil, G) {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < G.ny; y++) for (let x = 0; x < G.nx; x++) {
    let v = dil ? 0 : 1, done = false;
    for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue; const gx = x + dx, gy = y + dy;
      const s = (gx >= 0 && gx < G.nx && gy >= 0 && gy < G.ny) ? src[gy * G.nx + gx] : 0;
      if (dil) { if (s) { v = 1; done = true; break; } } else { if (!s) { v = 0; done = true; break; } }
    }
    out[y * G.nx + x] = v;
  }
  return out;
}
export const dilate = (s, r, G) => morph(s, r, true, G);
export const erode = (s, r, G) => morph(s, r, false, G);
export const close = (s, r, G) => erode(dilate(s, r, G), r, G);
export const open = (s, r, G) => dilate(erode(s, r, G), r, G);

export function component(mask, G, sx, sy) {
  const out = new Uint8Array(mask.length);
  const si = sy * G.nx + sx;
  if (sx < 0 || sx >= G.nx || sy < 0 || sy >= G.ny || !mask[si]) return out;
  const st = [si]; out[si] = 1;
  while (st.length) {
    const i = st.pop(), x = i % G.nx, y = (i / G.nx) | 0;
    const push = (nx2, ny2) => {
      if (nx2 < 0 || nx2 >= G.nx || ny2 < 0 || ny2 >= G.ny) return;
      const j = ny2 * G.nx + nx2; if (mask[j] && !out[j]) { out[j] = 1; st.push(j); }
    };
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return out;
}
export function dropSmallIslands(mask, G, minCells) {
  if (minCells <= 1) return mask;
  const out = new Uint8Array(mask.length);
  const seen = new Uint8Array(mask.length);
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    stack.length = 0; stack.push(s); seen[s] = 1;
    const cells = [];
    while (stack.length) {
      const i = stack.pop(); cells.push(i);
      const x = i % G.nx, y = (i / G.nx) | 0;
      const push = (nx2, ny2) => {
        if (nx2 < 0 || nx2 >= G.nx || ny2 < 0 || ny2 >= G.ny) return;
        const j = ny2 * G.nx + nx2; if (mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      };
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
    if (cells.length >= minCells) for (const i of cells) out[i] = 1;
  }
  return out;
}
export function fillHoles(mask, G) {
  const bg = new Uint8Array(mask.length); const st = [];
  const push = (x, y) => {
    if (x < 0 || x >= G.nx || y < 0 || y >= G.ny) return; const i = y * G.nx + x;
    if (!mask[i] && !bg[i]) { bg[i] = 1; st.push(i); }
  };
  for (let x = 0; x < G.nx; x++) { push(x, 0); push(x, G.ny - 1); }
  for (let y = 0; y < G.ny; y++) { push(0, y); push(G.nx - 1, y); }
  while (st.length) { const i = st.pop(), x = i % G.nx, y = (i / G.nx) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  const out = Uint8Array.from(mask); for (let i = 0; i < out.length; i++) if (!out[i] && !bg[i]) out[i] = 1; return out;
}
export function coverageMask(pts, G, closeFt) {
  return fillHoles(close(rasterize(pts, G), closeFt ?? PARAM.CLOSE_R, G), G);
}

function traceMask(mask, G) {
  const at = (x, y) => (x >= 0 && x < G.nx && y >= 0 && y < G.ny) ? mask[y * G.nx + x] : 0;
  const segs = new Map(); const key = (x, y) => x + ',' + y;
  const add = (ax, ay, bx, by) => { const k = key(ax, ay); if (!segs.has(k)) segs.set(k, []); segs.get(k).push([bx, by]); };
  for (let y = 0; y < G.ny; y++) for (let x = 0; x < G.nx; x++) {
    if (!mask[y * G.nx + x]) continue;
    if (!at(x, y - 1)) add(x, y, x + 1, y); if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1); if (!at(x - 1, y)) add(x, y + 1, x, y);
  }
  const rings = []; const used = new Set();
  for (const [start, nexts] of segs) {
    for (const n0 of nexts) {
      if (used.has(start + '>' + n0.join(','))) continue;
      const ring = []; let cur = start.split(',').map(Number); let nxt = n0; let guard = 0;
      while (guard++ < 2e6) {
        ring.push(cur); used.add(cur.join(',') + '>' + nxt.join(',')); cur = nxt;
        if (cur[0] === ring[0][0] && cur[1] === ring[0][1]) break;
        const outs = segs.get(key(cur[0], cur[1])) || []; let chosen = null;
        for (const o of outs) { if (!used.has(cur.join(',') + '>' + o.join(','))) { chosen = o; break; } }
        if (!chosen) break; nxt = chosen;
      }
      if (ring.length > 3) rings.push(ring);
    }
  }
  return rings;
}
function dp(pts, tol) {
  if (pts.length < 3) return pts; const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true; const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop(); let md = 0, mi = -1; const [x1, y1] = pts[s], [x2, y2] = pts[e];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    for (let i = s + 1; i < e; i++) { const [px, py] = pts[i]; const dd = Math.abs((px - x1) * dy - (py - y1) * dx) / len; if (dd > md) { md = dd; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = true; stack.push([s, mi], [mi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
export function ringArea(r) {
  let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s) / 2;
}
export function distTransform(mask, G) {
  const nx = G.nx, ny = G.ny, INF = 1e9, d = new Float64Array(mask.length);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  const D = 1, S = 1.41421356;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const i = y * nx + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + D); if (y > 0) v = Math.min(v, d[i - nx] + D);
    if (x > 0 && y > 0) v = Math.min(v, d[i - nx - 1] + S); if (x < nx - 1 && y > 0) v = Math.min(v, d[i - nx + 1] + S); d[i] = v;
  }
  for (let y = ny - 1; y >= 0; y--) for (let x = nx - 1; x >= 0; x--) {
    const i = y * nx + x; let v = d[i];
    if (x < nx - 1) v = Math.min(v, d[i + 1] + D); if (y < ny - 1) v = Math.min(v, d[i + nx] + D);
    if (x < nx - 1 && y < ny - 1) v = Math.min(v, d[i + nx + 1] + S); if (x > 0 && y < ny - 1) v = Math.min(v, d[i + nx - 1] + S); d[i] = v;
  }
  return d;
}
export function rasterizePolys(rings, G) {
  const mask = new Uint8Array(G.nx * G.ny);
  for (const r of rings) {
    if (r.length < 3) continue;
    const edges = [];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      edges.push({
        x0: (r[j][0] - G.x0) / G.R, y0: (r[j][1] - G.y0) / G.R,
        x1: (r[i][0] - G.x0) / G.R, y1: (r[i][1] - G.y0) / G.R,
      });
    }
    for (let gy = 0; gy < G.ny; gy++) {
      const yc = gy + 0.5; const xs = [];
      for (const e of edges) {
        const { x0, y0, x1, y1 } = e;
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) {
          xs.push(x0 + (yc - y0) / (y1 - y0) * (x1 - x0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(G.nx - 1, Math.floor(xs[k + 1] - 0.5));
        for (let gx = xa; gx <= xb; gx++) mask[gy * G.nx + gx] = 1;
      }
    }
  }
  return mask;
}

export function maskToPolys(mask, G, simplifyFt = PARAM.SIMPLIFY) {
  return traceMask(mask, G)
    .map((r) => (simplifyFt > 0 ? dp(r, simplifyFt / G.R) : r).map(([gx, gy]) => [G.x0 + gx * G.R, G.y0 + gy * G.R]))
    .filter((r) => r.length > 3 && ringArea(r) >= PARAM.MINAREA);
}
