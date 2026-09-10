import { windowUtc, timeLabelInZone } from '../monitoringWindow'

export const airWindowUtc = windowUtc

export function buildAirDay(config, readings, dateISO) {
  const { startUtc, endUtc } = airWindowUtc(config, dateISO)
  const stepMs = config.interval_minutes * 60_000

  const buckets = new Map()
  for (const r of readings) {
    const t = Date.parse(r.reading_at)
    const slot = Math.floor((t - startUtc.getTime()) / stepMs) * stepMs + startUtc.getTime()
    const key = `${r.station_key}|${slot}`
    const b = buckets.get(key) ?? { sum: 0, n: 0 }
    b.sum += r.value
    b.n += 1
    buckets.set(key, b)
  }

  const llraKeys = config.stations.filter((s) => s.chart === 'llra').map((s) => s.key)
  const alertOffset = config.thresholds?.alert_offset_mgm3 ?? null
  const actionOffset = config.thresholds?.action_offset_mgm3 ?? null

  const slots = []
  for (let t = startUtc.getTime(); t <= endUtc.getTime(); t += stepMs) {
    const values = {}
    for (const s of config.stations) {
      const b = buckets.get(`${s.key}|${t}`)
      values[s.key] = b && b.n > 0 ? b.sum / b.n / 1000 : null
    }
    const llraVals = llraKeys.map((k) => values[k]).filter((v) => v !== null)
    const minLlra = llraVals.length > 0 ? Math.min(...llraVals) : null
    slots.push({
      utcISO: new Date(t).toISOString(),
      timeLabel: timeLabelInZone(new Date(t), config.timezone),
      values,
      alertLevel: minLlra !== null && alertOffset !== null ? alertOffset + minLlra : null,
      actionLevel: minLlra !== null && actionOffset !== null ? actionOffset + minLlra : null,
    })
  }

  const populatedCount = slots.filter((s) => Object.values(s.values).some((v) => v !== null)).length

  return { dateISO, slots, populatedCount }
}
