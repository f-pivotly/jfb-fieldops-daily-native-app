export function mondayStartISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function addDaysISO(dateISO, days) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function weekEndISO(weekStartISO) {
  return addDaysISO(weekStartISO, 6)
}

export function previousWeekStart(weekStartISO) {
  return addDaysISO(weekStartISO, -7)
}

export function nextWeekStart(weekStartISO) {
  return addDaysISO(weekStartISO, 7)
}

export function defaultWeeklyWeekStart(todayISO) {
  return addDaysISO(mondayStartISO(todayISO), -7)
}

function calendarDayISO(iso, timeZone) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return timeZone
    ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function activityFallsInWeek(activity, weekStartISO, weekEndISOStr) {
  if (!activity?.start_date_time) return false
  const day = calendarDayISO(activity.start_date_time, activity.timezone)
  return !!day && day >= weekStartISO && day <= weekEndISOStr
}

function durationHours(startISO, endISO) {
  if (!startISO || !endISO) return 0
  const ms = new Date(endISO) - new Date(startISO)
  return ms > 0 ? ms / 3600000 : 0
}

export function buildWeeklyReport({ weekStart, reports, sections, contentRows, activities, resolveDelayLabel }) {
  const weekEnd = weekEndISO(weekStart)

  const weekReports = reports.filter((r) => r.report_date >= weekStart && r.report_date <= weekEnd)
  const releasedReports = weekReports.filter((r) => r.status === 'released')
  const releasedIds = new Set(releasedReports.map((r) => r.id))
  const reportDateById = new Map(releasedReports.map((r) => [r.id, r.report_date]))

  const activeSections = [...sections]
    .filter((s) => s.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const sectionReports = activeSections.map((s) => {
    const entries = contentRows
      .filter((c) => releasedIds.has(c.report_id) && c.narrative_label === s.narrative_label && c.content?.trim())
      .map((c) => ({ date: reportDateById.get(c.report_id), text: c.content.trim() }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    return { key: s.id, label: s.narrative_label, entries }
  })

  const weekActivities = activities.filter((a) => activityFallsInWeek(a, weekStart, weekEnd))
  const delayActivities = weekActivities.filter((a) => a.delay_code_id)
  const operatingActivities = weekActivities.filter((a) => !a.delay_code_id)

  const delayHoursByLabel = new Map()
  let delayApproxHours = 0
  for (const a of delayActivities) {
    const hours = durationHours(a.start_date_time, a.end_date_time)
    delayApproxHours += hours
    const label = resolveDelayLabel(a.delay_code_id) || 'Uncategorized delay'
    delayHoursByLabel.set(label, (delayHoursByLabel.get(label) || 0) + hours)
  }
  const operatingApproxHours = operatingActivities.reduce(
    (sum, a) => sum + durationHours(a.start_date_time, a.end_date_time),
    0,
  )

  return {
    weekStart,
    weekEnd,
    releasedCount: releasedReports.length,
    sections: sectionReports,
    hours: {
      operatingApprox: operatingApproxHours,
      delayApprox: delayApproxHours,
      byDelayLabel: [...delayHoursByLabel.entries()]
        .map(([description, hours]) => ({ description, hours }))
        .sort((a, b) => b.hours - a.hours),
    },
  }
}

export function buildNarrativeSectionsParam(sections, summaries, weekStart) {
  const activeSections = [...sections]
    .filter((s) => s.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  return activeSections
    .map((s) => {
      const row = summaries.find((r) => r.week_start === weekStart && r.section_key === s.narrative_label)
      return { label: s.narrative_label, content: (row?.content ?? '').trim() }
    })
    .filter((s) => s.content)
}
