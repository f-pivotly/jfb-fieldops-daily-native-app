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

export function isTidalConfig(config) {
  return config?.provider === 'wqdatalive'
}

export function buildTidalTurbidityDay(config, readings, dateISO, tideByMs, opts) {
  const { startUtc, endUtc } = reportWindowUtc(config, dateISO)
  const startMs = startUtc.getTime()
  const endMs = endUtc.getTime()
  const stepMs = config.interval_minutes * 60_000
  const offsetMs = (opts?.tideOffsetMin ?? 0) * 60_000

  const bucketAvg = (role, parameter = 'turbidity') => {
    const sums = new Map()
    for (const r of readings) {
      if (r.role !== role) continue
      if ((r.parameter ?? 'turbidity') !== parameter) continue
      const t = Date.parse(r.reading_at)
      if (t < startMs || t > endMs + stepMs) continue
      const slot = Math.floor((t - startMs) / stepMs) * stepMs + startMs
      const b = sums.get(slot) ?? { sum: 0, n: 0 }
      b.sum += Number(r.value)
      b.n += 1
      sums.set(slot, b)
    }
    return sums
  }
  const up = bucketAvg('upstream')
  const dn = bucketAvg('downstream')
  const upC = bucketAvg('upstream', 'conductivity')
  const dnC = bucketAvg('downstream', 'conductivity')

  const tideTimes = tideByMs ? [...tideByMs.keys()].sort((a, b) => a - b) : []
  const nearestTide = (t) => {
    if (!tideByMs || tideTimes.length === 0) return null
    let best = tideTimes[0]
    for (const tt of tideTimes) {
      if (Math.abs(tt - t) < Math.abs(best - t)) best = tt
    }
    return Math.abs(best - t) <= stepMs ? tideByMs.get(best) : null
  }

  const round1 = (v) => Math.round(v * 10) / 10
  const slots = []
  for (let t = startMs; t <= endMs; t += stepMs) {
    const u = up.get(t)
    const d = dn.get(t)
    const uc = upC.get(t)
    const dc = dnC.get(t)
    slots.push({
      utcISO: new Date(t).toISOString(),
      timeLabel: timeLabelInZone(new Date(t), config.timezone),
      upstream: u ? round1(u.sum / u.n) : null,
      downstream: d ? round1(d.sum / d.n) : null,
      upstreamCond: uc ? Math.round(uc.sum / uc.n) : null,
      downstreamCond: dc ? Math.round(dc.sum / dc.n) : null,
      tideFt: nearestTide(t - offsetMs),
    })
  }

  if (opts?.compliance) {
    const ew = opts.thresholds?.early_warning_delta_ntu ?? null
    const comp = opts.thresholds?.compliance_delta_ntu ?? null
    const ref = opts.referenceNtu ?? null
    const round2 = (v) => Math.round(v * 100) / 100
    const ewLine = ref !== null && ew !== null ? round2(ref + ew) : null
    const compLine = ref !== null && comp !== null ? round2(ref + comp) : null
    for (const s of slots) {
      s.background = ref
      s.earlyWarningLine = ewLine
      s.complianceLine = compLine
      s.exceedance = compLine !== null
        && ((s.upstream !== null && s.upstream > compLine) || (s.downstream !== null && s.downstream > compLine))
    }
  }

  const populatedCount = slots.filter((s) => s.upstream !== null || s.downstream !== null).length
  return { dateISO, slots, populatedCount }
}

export function tidalLimits(thresholds, referenceNtu) {
  const ewDelta = thresholds?.early_warning_delta_ntu ?? null
  const compDelta = thresholds?.compliance_delta_ntu ?? null
  return {
    ewDelta,
    compDelta,
    responseActionNtu: referenceNtu != null && ewDelta != null ? referenceNtu + ewDelta : null,
    notToExceedNtu: referenceNtu != null && compDelta != null ? referenceNtu + compDelta : null,
  }
}
