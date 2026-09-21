export const SF_PER_ACRE = 43560
export const LIFT_THICKNESS_WARN_IN = 4

export function num(v, digits) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null
}

export function computeAvgFace(volume, area) {
  const v = volume === null || volume === undefined || volume === '' ? null : Number(volume)
  const a = area === null || area === undefined || area === '' ? null : Number(area)
  if (v === null || a === null || !Number.isFinite(v) || !Number.isFinite(a) || a === 0) return null
  return (v * 27) / a
}

export function deriveCap(tons, factor, sf) {
  const cy = tons != null && factor != null && factor !== 0 ? tons / factor : null
  const thickness = cy != null && sf != null && sf !== 0 ? (cy * 324) / sf : null
  const acres = sf != null && sf !== 0 ? sf / SF_PER_ACRE : null
  return { cy, thickness, acres }
}

export function fmt(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { maximumFractionDigits: digits })
}
