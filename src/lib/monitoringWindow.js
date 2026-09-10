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

export function windowUtc(config, dateISO) {
  return {
    startUtc: zonedTimeToUtc(dateISO, config.window_start, config.timezone),
    endUtc: zonedTimeToUtc(dateISO, config.window_end, config.timezone),
  }
}

export function timeLabelInZone(d, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d)
}
