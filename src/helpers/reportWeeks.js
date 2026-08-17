const MS_PER_DAY = 24 * 60 * 60 * 1000

/** ISO-8601 week number (1-53) of a YYYY-MM-DD date string. */
export function calWeekOf(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const target = new Date(d.getTime())
  const dayNum = (d.getUTCDay() + 6) % 7 // Mon=0 .. Sun=6
  target.setUTCDate(target.getUTCDate() - dayNum + 3) // nearest Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  return 1 + Math.round((target - firstThursday) / (7 * MS_PER_DAY))
}

/** Week number of dateISO relative to projectStartDateISO (week 1 = start date's week). */
export function projectWeekOf(dateISO, projectStartDateISO) {
  if (!projectStartDateISO) return null
  const start = new Date(`${projectStartDateISO.slice(0, 10)}T00:00:00Z`)
  const date = new Date(`${dateISO}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(date.getTime())) return null
  const daysBetween = Math.floor((date - start) / MS_PER_DAY)
  return Math.floor(daysBetween / 7) + 1
}
