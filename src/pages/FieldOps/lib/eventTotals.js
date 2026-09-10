import { isProductiveActivity } from './workType'

export const UNATTRIBUTED_CATEGORY = 'UNATTRIBUTED'

export const hoursBetween = (startISO, endISO) => {
  const ms = new Date(endISO) - new Date(startISO)
  return Number.isFinite(ms) && ms > 0 ? ms / 3600000 : 0
}

export const isUnattributed = (activity) => activity?.category === UNATTRIBUTED_CATEGORY

export function findEventGaps(sorted, minGapMs = 60_000) {
  if (sorted.length < 2) return []
  const gaps = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i]
    const next = sorted[i + 1]
    const prevEnd = Date.parse(prev.end_date_time)
    const nextStart = Date.parse(next.start_date_time)
    if (!Number.isFinite(prevEnd) || !Number.isFinite(nextStart)) continue
    const durationMs = nextStart - prevEnd
    if (durationMs <= minGapMs) continue
    gaps.push({ prevId: prev.id, prev, next, gapStart: prev.end_date_time, gapEnd: next.start_date_time, durationMs })
  }
  return gaps
}

export function shiftTotals(sorted) {
  if (sorted.length === 0) return null
  let ops = 0
  let delay = 0
  for (const e of sorted) {
    if (isProductiveActivity(e)) ops += hoursBetween(e.start_date_time, e.end_date_time)
    else delay += hoursBetween(e.start_date_time, e.end_date_time)
  }
  const startISO = sorted[0].start_date_time
  const endISO = sorted.reduce(
    (latest, e) => (new Date(e.end_date_time) > new Date(latest) ? e.end_date_time : latest),
    sorted[0].end_date_time,
  )
  const shift = hoursBetween(startISO, endISO)
  return { startISO, endISO, ops, delay, shift, balanced: Math.abs(ops + delay - shift) <= 1 / 60 }
}

export function fmtDurationMs(ms) {
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
