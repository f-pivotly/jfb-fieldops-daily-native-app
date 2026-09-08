// Shapes raw jfb_water_quality_readings into the Daily Turbidity Reporting
// page model -- the 15-minute slot table and the background-vs-compliance
// delta. Ported from the non-native app's src/lib/waterQuality/data.ts.
//
// Fixed-site only (HydroVu, Torch Lake style) -- the tidal/WQData LIVE
// variant is explicitly out of scope for this phase (see
// WATER_AIR_QUALITY_MIGRATION_PLAN.md section 5).
//
//   delta   = background - compliance
//   avgDelta = AVERAGE(delta over all slots)

/**
 * Convert a local wall-clock time on a date in an IANA zone to the UTC
 * instant. Two-pass Intl trick -- no date library in this repo.
 */
export function zonedTimeToUtc(dateISO, timeHHMM, timeZone) {
  const guess = new Date(`${dateISO}T${timeHHMM.slice(0, 5)}:00Z`)
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = Object.fromEntries(dtf.formatToParts(guess).map((p) => [p.type, p.value]))
  const asZone = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second),
  )
  return new Date(guess.getTime() - (asZone - guess.getTime()))
}

/** UTC bounds of the report's local monitoring window for one date. */
export function reportWindowUtc(config, dateISO) {
  return {
    startUtc: zonedTimeToUtc(dateISO, config.window_start, config.timezone),
    endUtc: zonedTimeToUtc(dateISO, config.window_end, config.timezone),
  }
}

function timeLabelInZone(d, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d)
}

/**
 * Build the slot table for one report date. Slots run window_start ->
 * window_end inclusive at interval_minutes. Readings match a slot on exact
 * timestamp equality.
 */
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
