import { windowUtc, timeLabelInZone } from '../monitoringWindow'

export const reportWindowUtc = windowUtc

export function buildTurbidityDay(config, readings, dateISO) {
  const { startUtc, endUtc } = reportWindowUtc(config, dateISO)
  const stepMs = config.interval_minutes * 60_000

  const byRoleTime = new Map()
  for (const r of readings) {
    const t = Math.round(Date.parse(r.reading_at) / 60_000) * 60_000
    byRoleTime.set(`${r.role}|${t}`, r.value)
  }

  const slots = []
  for (let t = startUtc.getTime(); t <= endUtc.getTime(); t += stepMs) {
    const background = byRoleTime.get(`background|${t}`) ?? null
    const earlyWarning = byRoleTime.get(`early_warning|${t}`) ?? null
    const compliance = byRoleTime.get(`compliance|${t}`) ?? null
    slots.push({
      utcISO: new Date(t).toISOString(),
      timeLabel: timeLabelInZone(new Date(t), config.timezone),
      background,
      earlyWarning,
      compliance,
      delta: background !== null && compliance !== null ? background - compliance : null,
    })
  }

  const deltas = slots.map((s) => s.delta).filter((d) => d !== null)
  const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null
  const populatedCount = slots.filter(
    (s) => s.background !== null || s.earlyWarning !== null || s.compliance !== null,
  ).length

  return { dateISO, slots, avgDelta, populatedCount }
}
