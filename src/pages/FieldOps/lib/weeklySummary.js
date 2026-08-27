// Pure computation for the Weekly Summary page -- no React, no fetching.
// Mirrors the sibling vanilla app's src/lib/weeklySummary.ts split between
// pure aggregation and data-fetching, adapted to this app's actual domains.

// Production weeks for THIS feature run Monday->Sunday, matching the vanilla
// app's own Weekly Summary convention. That's a different convention from
// the Sunday-start week src/hooks/useAutoMetricValues.js uses for cover-page
// metrics -- two separate features with two separate (documented) week
// conventions, not a bug.
// Anchored entirely in UTC (parse with a 'Z' suffix, mutate with the UTC
// setters, read back with getUTCDay/toISOString) rather than local time.
// Parsing as LOCAL midnight and then reading it back via toISOString() rolls
// the date backward by a day for any viewer whose timezone is ahead of UTC
// (e.g. Asia/Manila, UTC+8) -- and since defaultWeeklyWeekStart below chains
// two of these calls together, that one-day slip compounded into a multi-day
// drift (observed: the page showing "2026-08-15 - 2026-08-20", a 6-day
// non-Monday-start range, instead of the correct 2026-08-17 - 2026-08-23).
export function mondayStartISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  const day = d.getUTCDay() // 0=Sun..6=Sat
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

// The most recently COMPLETED Monday-Sunday week -- this Monday minus 7
// days. A PM can't build a summary for the still-in-progress current week,
// mirroring the vanilla app's own rule.
export function defaultWeeklyWeekStart(todayISO) {
  return addDaysISO(mondayStartISO(todayISO), -7)
}

// Same per-row, per-timezone calendar-day check src/pages/FieldOps/
// reportEditorTabs/hooks/useEvents.js uses for a single day, generalized to
// a date range.
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

// Builds the week's narrative reference lists plus an approximate hours
// breakdown.
//
// The hours are approximate, not GOH/NOH-exact: jfb_daily_activities has no
// `category` column (only a nullable delay_code_id), so "operating" here
// just means "no delay code attached" -- there's no way to further separate
// true operating time from mobilization/startup/other bookend time the way
// the vanilla app's richer `daily_events.category` field could. Same
// platform-level gap already documented in METRICS_MIGRATION_PLAN.md §5.
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

// For the PDF only (rpt-jfb-weekly-summary): the vanilla app's Weekly
// Summary PDF prints the PM's *saved* weekly rollup per section, never the
// daily reference bullets -- an unedited section is invisible in the PDF
// even though its daily entries were visible on screen. Mirrors that exactly
// via jfb_weekly_summaries instead of jfb_report_narratives_v2.
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
