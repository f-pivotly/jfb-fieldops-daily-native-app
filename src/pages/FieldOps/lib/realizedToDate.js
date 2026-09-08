// Realized To-Date computation. Pure functions, no I/O -- ported near-verbatim
// from the non-native app's src/lib/realizedToDate.ts, which carries several
// incident-driven correctness fixes (see inline comments below, each still
// citing the original bug). Two things are simpler here than in the source:
//
//   - No `events` array / delay-category classification loop. The delay
//     summary comes pre-aggregated from dvw-jfb-realized-delay-summary,
//     which resolves categories through the FK-governed jfb_delay_codes /
//     jfb_project_delay_codes domains -- unlike the non-native app's free-text
//     daily_events.delay_category, there's no case-variant cleanup needed.
//   - No separate NOH loop over raw events. Each `days[]` row already carries
//     its own `noh` (dvw-jfb-realized-daily-totals sums it per day using the
//     same delay_code_id IS NULL rule as dvw-jfb-noh), so cyPerNoh is a
//     straight sum-and-divide here.
//
// Everything else -- project-week bucketing, the four rate projections, the
// day-by-day cumulative walk, GOH-vs-calendar pace -- is the same math as the
// source, because none of it is naturally SQL-shaped (it's sequential/
// incremental over a date range), so porting the logic beats re-deriving it.

// ---------------------------------------------------------------------------
// Local-time ISO date helpers (ported from the non-native app's src/lib/dates.ts,
// trimmed to the four functions realizedToDate.ts actually uses). NEVER format
// dates with toISOString() -- that converts to UTC and silently shifts the day
// across midnight.
// ---------------------------------------------------------------------------

function formatDate(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayOfWeek(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  return WEEKDAY[new Date(y, m - 1, d).getDay()]
}

/** Monday-of-week ISO date. Production weeks run Monday-Sunday. */
function mondayStartISO(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dow = dt.getDay() // 0 = Sun .. 6 = Sat
  const sinceMonday = dow === 0 ? 6 : dow - 1
  dt.setDate(dt.getDate() - sinceMonday)
  return formatDate(dt)
}

function parseLocalDate(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDaysISO(dateISO, days) {
  const dt = parseLocalDate(dateISO)
  dt.setDate(dt.getDate() + Math.round(days))
  return formatDate(dt)
}

/** Whole calendar days from a to b (b - a). Negative if b is before a. */
function daysBetween(aISO, bISO) {
  const a = parseLocalDate(aISO).getTime()
  const b = parseLocalDate(bISO).getTime()
  return Math.round((b - a) / 86_400_000)
}

/** Today as a local-time ISO date (never toISOString() -- see file header). */
export function todayISO() {
  return formatDate(new Date())
}

/** Render YYYY-MM-DD as "May 28, 2026". */
export function prettyDate(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export { addDaysISO, mondayStartISO, daysBetween }

// ---------------------------------------------------------------------------
// Report shapes (JS objects, documented via JSDoc -- see the non-native app's
// realizedToDate.ts for the equivalent TypeScript interfaces this mirrors).
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ProductionDayInput
 * @property {string} date - ISO YYYY-MM-DD.
 * @property {number} cy - Sum of production_stats.volume for the day.
 * @property {number} goh - Sum of activity duration (hours), every activity, for the day.
 * @property {number} noh - Sum of activity duration (hours), only delay_code_id IS NULL, for the day.
 */

/** @typedef {{ category: string, code: string, hours: number }} DelaySummaryInputRow */

const PROJECTION_DEFS = [
  { key: 'overall', label: 'Overall rate', window: null },
  { key: 'last7', label: 'Last week', window: 7 },
  { key: 'last14', label: 'Last 2 weeks', window: 14 },
  { key: 'last30', label: 'Last month', window: 30 },
]

function maxISO(a, b) {
  return daysBetween(a, b) >= 0 ? b : a
}
function minISO(a, b) {
  return daysBetween(a, b) <= 0 ? a : b
}

/** Project-week number for a date, anchored to the Monday of the start week,
 *  pausing the counter during shutdown periods. Week 1 = the Mon-Sun week
 *  containing the start. */
export function projectWeekFor(dateISO, startISO, breaks) {
  const firstMonday = mondayStartISO(startISO)
  const elapsed = daysBetween(firstMonday, dateISO)
  if (elapsed < 0) return 1
  let shutdownDays = 0
  for (const b of breaks) {
    const lo = maxISO(firstMonday, b.shutdown_start)
    const hi = minISO(dateISO, b.shutdown_end)
    const overlap = daysBetween(lo, hi)
    if (overlap > 0) shutdownDays += overlap
  }
  const effective = Math.max(0, elapsed - shutdownDays)
  return Math.floor(effective / 7) + 1
}

function rate(cy, goh) {
  return goh > 0 ? cy / goh : 0
}

/**
 * Build the full Realized To-Date report.
 *
 * @param {{ name: string, client?: string, primary_measure?: string, volume_goal?: number,
 *   cy_goh_goal?: number, start_date: string, expected_goh_per_day?: number,
 *   production_days_per_week?: number }} project
 * @param {ProductionDayInput[]} days - released production days, any order.
 * @param {DelaySummaryInputRow[]} delayRows - pre-aggregated captured-week delay hours
 *   (from dvw-jfb-realized-delay-summary), already scoped to the captured week by the caller.
 * @param {Set<string>} excluded - ISO dates excluded from every rate/pace/forecast calc.
 * @param {Map<string, string>} reasons - ISO date -> exclusion reason, for display.
 * @param {Array<{ shutdown_start: string, shutdown_end: string }>} breaks
 * @param {string} today - ISO date used as the projection anchor.
 * @param {{ unit: string, goal: number, bidRate: number, baselineCy?: number, paceByGoh?: boolean }} [measure] -
 *   optional non-CY measure override. Omit to use volume_goal/cy_goh_goal/primary_measure as-is.
 */
export function buildRealizedReport(project, days, delayRows, excluded, reasons, breaks, today, measure) {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const start = project.start_date
  const goal = measure ? measure.goal : project.volume_goal ?? 0
  const bidRate = measure ? measure.bidRate : project.cy_goh_goal ?? 0
  const baselineCy = measure?.baselineCy ?? 0
  const paceByGoh = measure?.paceByGoh ?? false
  const expGoh = project.expected_goh_per_day
  const daysPerWeek = project.production_days_per_week
  const planEnabled = expGoh != null && expGoh > 0 && daysPerWeek != null && daysPerWeek > 0
  const anticipatedDailyProduction = expGoh != null && bidRate > 0 ? bidRate * expGoh : null

  const hasBidPlan =
    anticipatedDailyProduction != null &&
    anticipatedDailyProduction > 0 &&
    goal > 0 &&
    daysPerWeek != null &&
    daysPerWeek > 0

  // -- Log rows + week grouping (running total counts non-excluded only) --
  let runningCy = 0
  const rows = sorted.map((d) => {
    const isExcl = excluded.has(d.date)
    if (!isExcl) runningCy += d.cy
    return {
      date: d.date,
      cy: d.cy,
      goh: d.goh,
      cyPerGoh: rate(d.cy, d.goh),
      excluded: isExcl,
      reason: isExcl ? reasons.get(d.date) ?? null : null,
      projectWeek: projectWeekFor(d.date, start, breaks),
      runningCy,
    }
  })

  const weeks = []
  for (const r of rows) {
    let wk = weeks.find((w) => w.projectWeek === r.projectWeek)
    if (!wk) {
      wk = { projectWeek: r.projectWeek, rows: [], subtotalCy: 0, subtotalGoh: 0 }
      weeks.push(wk)
    }
    wk.rows.push(r)
    if (!r.excluded) {
      wk.subtotalCy += r.cy
      wk.subtotalGoh += r.goh
    }
  }
  weeks.sort((a, b) => a.projectWeek - b.projectWeek)

  // -- Summary (non-excluded days only) --
  const included = sorted.filter((d) => !excluded.has(d.date))
  const produced = included.reduce((a, d) => a + d.cy, 0)
  const toDate = baselineCy + produced
  const totalGoh = included.reduce((a, d) => a + d.goh, 0)
  const totalNoh = included.reduce((a, d) => a + (d.noh ?? 0), 0)
  const currentRate = rate(produced, totalGoh)
  const cyPerNoh = rate(produced, totalNoh)
  const pctComplete = goal > 0 ? toDate / goal : 0

  // Pace vs plan. CALENDAR basis (default): planned = anticipated/day x
  // production days -- assumes full-time dedication. GOH basis (shared
  // equipment, paceByGoh): planned = GOH worked x bid rate, so days spent on
  // another contract aren't charged against this one.
  const productionDays = included.length
  const plannedToDate =
    anticipatedDailyProduction == null
      ? null
      : paceByGoh
        ? totalGoh * bidRate
        : anticipatedDailyProduction * productionDays
  const cyAheadOfPace = plannedToDate != null ? produced - plannedToDate : null
  const daysAheadBehind =
    anticipatedDailyProduction && anticipatedDailyProduction > 0 && cyAheadOfPace != null
      ? cyAheadOfPace / anticipatedDailyProduction
      : null

  // -- Four projections (CY-per-GOH) --
  // Windows are anchored to the LAST CAPTURED WEEK's end (Sunday), NOT to
  // today, so "Last week" pulls exactly the Mon-Sun window the weekly log
  // shows and the projection rate matches the log's totals row by
  // construction. (Reference-app fix: today-anchored windows were off by
  // 1-2 days and pulled a partial week, inflating the rate.)
  const projectionAnchor = addDaysISO(mondayStartISO(today), -1) // Sunday of last captured week
  const remaining = Math.max(0, goal - toDate)
  const projections = PROJECTION_DEFS.map((def) => {
    let window
    if (def.window == null) {
      window = included
    } else {
      const startCutoff = addDaysISO(projectionAnchor, -(def.window - 1))
      window = included.filter((d) => d.date >= startCutoff && d.date <= projectionAnchor)
    }
    const winCy = window.reduce((a, d) => a + d.cy, 0)
    const winGoh = window.reduce((a, d) => a + d.goh, 0)
    const rateCyPerGoh = rate(winCy, winGoh)
    const complete = remaining <= 0 && goal > 0

    let estCompletionDate = null
    let workDaysRemaining = null
    if (!complete && rateCyPerGoh > 0 && remaining > 0 && expGoh != null && expGoh > 0) {
      const projectedCyPerDay = rateCyPerGoh * expGoh
      if (projectedCyPerDay > 0) {
        const remainingProductionDays = remaining / projectedCyPerDay
        workDaysRemaining = Math.ceil(remainingProductionDays)
        if (planEnabled) {
          const remainingCalendarDays = remainingProductionDays * (7 / daysPerWeek)
          estCompletionDate = addDaysISO(today, Math.ceil(remainingCalendarDays))
        }
      }
    }
    return {
      key: def.key,
      label: def.label,
      windowDays: window.length,
      rateCyPerGoh,
      estCompletionDate,
      workDaysRemaining,
      complete,
    }
  })

  // -- Captured week = the PREVIOUS complete Mon-Sun week relative to the
  //    generation date. Bar chart + weekly log + delay summary all cover this. --
  const currentWeekStart = addDaysISO(mondayStartISO(today), -7)
  const currentWeekEnd = addDaysISO(currentWeekStart, 6)
  const reportedWeek = projectWeekFor(currentWeekStart, start, breaks)
  const cyByDate = new Map(sorted.map((d) => [d.date, d.cy]))
  const gohByDate = new Map(sorted.map((d) => [d.date, d.goh]))
  const reportDates = new Set(sorted.map((d) => d.date))
  const currentWeekBars = Array.from({ length: 7 }, (_, i) => addDaysISO(currentWeekStart, i))
    .filter((date) => reportDates.has(date))
    .map((date) => ({
      date,
      weekday: dayOfWeek(date),
      cy: cyByDate.get(date) ?? 0,
      goh: gohByDate.get(date) ?? 0,
    }))
  const inWeek = included.filter((d) => d.date >= currentWeekStart && d.date <= currentWeekEnd)
  const throughDate = inWeek.length ? inWeek[inWeek.length - 1].date : currentWeekEnd

  // -- Cumulative CY by date (non-excluded) + week markers for the x-axis. --
  const firstProd = included.find((d) => d.cy > 0)?.date ?? (included[0]?.date ?? currentWeekStart)
  const lastCum = included.length ? included[included.length - 1].date : currentWeekStart
  const spanStart = mondayStartISO(firstProd)

  const plannedCyToDate = hasBidPlan
    ? baselineCy + (paceByGoh ? totalGoh * bidRate : anticipatedDailyProduction * productionDays)
    : 0
  const remainingAtBidPace = hasBidPlan ? Math.max(0, goal - plannedCyToDate) : 0
  const naiveCalDaysToBidGoalEnd = hasBidPlan
    ? Math.ceil((remainingAtBidPace / anticipatedDailyProduction) * (7 / daysPerWeek))
    : 0
  // Account for future scheduled off-days by extending the projection window
  // by however many excluded dates fall inside it. Converges within a few
  // iterations since extending the window can pull in more excluded days.
  const projectionBase = included.length ? lastCum : start
  let calDaysToBidGoalEnd = naiveCalDaysToBidGoalEnd
  if (hasBidPlan && excluded.size > 0) {
    for (let i = 0; i < 5; i++) {
      let futureExclInWindow = 0
      for (const date of excluded) {
        if (date <= projectionBase) continue
        const gap = daysBetween(projectionBase, date)
        if (gap > 0 && gap <= calDaysToBidGoalEnd) futureExclInWindow++
      }
      const next = naiveCalDaysToBidGoalEnd + futureExclInWindow
      if (next === calDaysToBidGoalEnd) break
      calDaysToBidGoalEnd = next
    }
  }
  const bidGoalEndDate = hasBidPlan ? addDaysISO(projectionBase, calDaysToBidGoalEnd) : null

  const targetEnd = bidGoalEndDate
  const lastNeeded = targetEnd && daysBetween(lastCum, targetEnd) > 0 ? targetEnd : lastCum
  const weekStarts = []
  for (let ws = spanStart; daysBetween(ws, lastNeeded) >= 0; ws = addDaysISO(ws, 7)) {
    weekStarts.push(ws)
  }
  if (weekStarts.length === 0) weekStarts.push(spanStart)
  const nWeeks = weekStarts.length
  const spanDays = 7 * nWeeks
  const cumulativeWeeks = weekStarts.map((ws) => projectWeekFor(ws, start, breaks))

  let preSpanProductionDays = 0
  let preSpanCum = 0
  for (const d of included) {
    if (d.date < spanStart) {
      preSpanProductionDays++
      preSpanCum += d.cy
    }
  }

  // Day-by-day cumulative build. Iterate every calendar day between spanStart
  // and lastCum, emitting one cumulative point per day. Included days add to
  // `cum`; excluded/no-report days hold the running total FLAT -- that's what
  // makes the chart line plateau visibly during excluded stretches instead of
  // drawing a false diagonal rise (reference-app fix, e.g. a multi-week gap
  // between access dredging and full production).
  const cyByIncludedDate = new Map(included.map((d) => [d.date, d.cy]))
  const gohByIncludedDate = new Map(included.map((d) => [d.date, d.goh]))
  let cum = preSpanCum + baselineCy
  let productionDaysSoFar = preSpanProductionDays
  let gohSoFar = 0
  const anticipated = anticipatedDailyProduction ?? 0
  const cumulative = []
  const goldPointsRaw = []
  if (preSpanProductionDays === 0) {
    cumulative.push({ date: spanStart, cumCy: baselineCy, xFrac: 0 })
    if (hasBidPlan) goldPointsRaw.push({ xFrac: 0, cumCy: baselineCy })
  }
  {
    const spanEndForWalk = lastCum
    let walk = spanStart
    while (daysBetween(walk, spanEndForWalk) >= 0) {
      const isExcl = excluded.has(walk)
      const dayCy = cyByIncludedDate.get(walk)
      if (dayCy !== undefined && !isExcl) {
        cum += dayCy
        productionDaysSoFar += 1
        gohSoFar += gohByIncludedDate.get(walk) ?? 0
      }
      const xFrac = Math.min(1, Math.max(0, daysBetween(spanStart, walk) / spanDays))
      cumulative.push({ date: walk, cumCy: cum, xFrac })
      if (hasBidPlan) {
        goldPointsRaw.push({
          xFrac,
          cumCy: Math.min(goal, baselineCy + (paceByGoh ? gohSoFar * bidRate : productionDaysSoFar * anticipated)),
        })
      }
      walk = addDaysISO(walk, 1)
    }
  }

  // Planned-pace amber line: append the forward projection to the goal date
  // so the line completes visually to bidGoalEndDate.
  const goalProjection =
    hasBidPlan && goldPointsRaw.length > 0
      ? (() => {
          const points = [...goldPointsRaw]
          const lastGold = points[points.length - 1]
          if (bidGoalEndDate && lastGold.cumCy < goal) {
            points.push({
              xFrac: Math.min(1, Math.max(0, daysBetween(spanStart, bidGoalEndDate) / spanDays)),
              cumCy: goal,
            })
          }
          return { points, targetDate: bidGoalEndDate ?? lastCum }
        })()
      : null

  // Overall-rate forecast line: extend the current overall CY/production-day
  // slope forward from today to the chart's right edge, only accruing on
  // future production days (accounts for weekends and future scheduled
  // off-days) -- a plain calendar-linear projection over-counts 6-day
  // workweeks (reference-app fix).
  const lastPt = cumulative.length ? cumulative[cumulative.length - 1] : null
  const productionDaysThroughLast = productionDays
  const rateForecastEndCy = (() => {
    if (!lastPt || productionDaysThroughLast <= 0) return null
    const perProductionDay = produced / productionDaysThroughLast
    const spanEnd = addDaysISO(spanStart, spanDays)
    const perWeek = daysPerWeek ?? 6
    let futureProductionDays = 0
    let walk = addDaysISO(lastCum, 1)
    while (daysBetween(walk, spanEnd) >= 0) {
      if (!excluded.has(walk)) {
        const dow = new Date(walk + 'T00:00:00').getDay()
        const isOffDay = perWeek < 7 && dow === 0
        if (!isOffDay) futureProductionDays += 1
      }
      walk = addDaysISO(walk, 1)
    }
    return lastPt.cumCy + perProductionDay * futureProductionDays
  })()

  // -- Delay-code summary for the current week -- pre-aggregated by the
  //    caller via dvw-jfb-realized-delay-summary (already scoped to the
  //    captured week's date range), just shaped + sorted here. --
  const delayTotalHours = delayRows.reduce((a, r) => a + (Number(r.hours) || 0), 0)
  const delaySummary = [...delayRows]
    .map((r) => ({
      description: r.code || r.category || 'Uncategorized',
      hours: Number(r.hours) || 0,
      pct: delayTotalHours > 0 ? (Number(r.hours) || 0) / delayTotalHours : 0,
    }))
    .sort((a, b) => b.hours - a.hours)

  // Forecast block at bid pace. Computed directly from remaining CY rather
  // than through the calendar gap to bidGoalEndDate, which is derived from
  // the same inputs but introduces rounding drift (reference-app fix).
  const targetDate = bidGoalEndDate
  let forecast = null
  if (planEnabled && hasBidPlan && targetDate && remaining > 0) {
    const workDaysRemaining = Math.ceil(remaining / anticipatedDailyProduction)
    const estGohRemaining = Math.round(workDaysRemaining * expGoh)
    const cyPerDayToMeetGoal = anticipatedDailyProduction
    forecast = { targetDate, workDaysRemaining, estGohRemaining, cyPerDayToMeetGoal }
  }

  return {
    summary: {
      projectName: project.name,
      client: project.client ?? '',
      startDate: start,
      throughDate,
      unit: measure ? measure.unit : project.primary_measure || 'CY',
      goal,
      toDate,
      remaining,
      pctComplete,
      bidRate,
      currentRate,
      cyPerNoh,
      totalGoh,
      totalNoh,
      daysAheadBehind,
      plannedToDate,
      cyAheadOfPace,
      anticipatedDailyProduction,
      planEnabled,
      paceByGoh,
    },
    weeks,
    projections,
    productionDays,
    currentWeekStart,
    reportedWeek,
    currentWeekBars,
    bidGoalPerDay: anticipatedDailyProduction,
    cumulative,
    cumulativeWeeks,
    goalProjection,
    rateForecastEndCy,
    delaySummary,
    delayTotalHours,
    forecast,
  }
}
