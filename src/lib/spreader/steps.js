export function stepSecs(s) {
  const m = String(s.timeStr ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return +m[1] * 3600 + +m[2] * 60 + (m[3] ? +m[3] : 0)
}

const NUM = (v) => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ]/g, ''))
  return isFinite(n) ? n : null
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const COLS = {
  area: /^area$/,
  lane: /^lane$/,
  stepNo: /^stepnumber$|^step$/,
  dateStr: /^stepstartdate$|^date$/,
  timeStr: /^stepstarttime$|^time$/,
  n: /^northing/,
  e: /^easting/,
  lengthFt: /^length/,
  widthFt: /^width/,
  tons: /^weighttons$|^tons$|^weight/,
  cy: /^cubicyards$|^cy$/,
  inchesStep: /^inchesstep$|^inches/,
}

function parseStepRows(rows) {
  let hdr = -1
  for (let i = 0; i < rows.length; i++) {
    const set = new Set(rows[i].map((c) => norm(String(c ?? ''))))
    if (
      set.has('area') &&
      [...set].some((s) => s.startsWith('northing')) &&
      [...set].some((s) => s.startsWith('easting'))
    ) {
      hdr = i
      break
    }
  }
  if (hdr < 0) throw new Error('Step Detail: could not find a header row with Area / Northing / Easting.')

  const headers = rows[hdr].map((c) => norm(String(c ?? '')))
  const col = {}
  for (const [field, re] of Object.entries(COLS)) {
    const idx = headers.findIndex((h) => re.test(h))
    if (idx >= 0) col[field] = idx
  }
  for (const req of ['n', 'e']) {
    if (col[req] == null) throw new Error(`Step Detail: missing required "${req}" column.`)
  }

  const out = []
  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i]
    const area = col.area != null ? String(r[col.area] ?? '').trim() : ''
    const n = NUM(r[col.n])
    const e = NUM(r[col.e])
    if (n == null || e == null) continue
    out.push({
      area,
      lane: col.lane != null ? String(r[col.lane] ?? '').trim() : '',
      stepNo: NUM(col.stepNo != null ? r[col.stepNo] : null) ?? out.length + 1,
      dateStr: col.dateStr != null ? String(r[col.dateStr] ?? '').trim() : '',
      timeStr: col.timeStr != null ? String(r[col.timeStr] ?? '').trim() : '',
      n,
      e,
      lengthFt: NUM(col.lengthFt != null ? r[col.lengthFt] : null) ?? 10,
      widthFt: NUM(col.widthFt != null ? r[col.widthFt] : null) ?? 35,
      tons: NUM(col.tons != null ? r[col.tons] : null),
      cy: NUM(col.cy != null ? r[col.cy] : null),
      inchesStep: NUM(col.inchesStep != null ? r[col.inchesStep] : null),
    })
  }
  return out
}

export function parseStepCsv(text) {
  const rows = String(text ?? '')
    .split(/\r?\n/)
    .filter((l) => l.length)
    .map(splitCsvLine)
  return parseStepRows(rows)
}

function splitCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}
