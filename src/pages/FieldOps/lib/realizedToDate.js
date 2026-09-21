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

function mondayStartISO(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dow = dt.getDay()
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

function daysBetween(aISO, bISO) {
  const a = parseLocalDate(aISO).getTime()
  const b = parseLocalDate(bISO).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function todayISO() {
  return formatDate(new Date())
}

export function prettyDate(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export { addDaysISO, mondayStartISO, daysBetween }

export function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function fmtNum(n) {
  return Math.round(n ?? 0).toLocaleString()
}

export function fmtHrs(n) {
  return (n ?? 0).toFixed(2)
}

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

function projectWeekFor(dateISO, startISO, breaks) {
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

export function rate(cy, goh) {
  return goh > 0 ? cy / goh : 0
}

/**
 * Tonnage measure for a placement project paid by the ton, or null for CY.
 * Mirrors the non-native app's fetchTonnageMeasure: sum the active materials'
 * tons_goal for the goal, and blend their tons_per_hour_goal into one bid rate
 * (total tons / total bid hours). A material with a goal but no rate still
 * counts toward the goal, not the rate.
 */
export function tonnageMeasure(materials) {
  let goal = 0
  let hours = 0
  let usable = 0
  for (const m of materials ?? []) {
    if (m.active === false) continue
    const tons = Number(m.tons_goal ?? 0)
    const rate = Number(m.tons_per_hour_goal ?? 0)
    if (!(tons > 0)) continue
    goal += tons
    if (rate > 0) {
      hours += tons / rate
      usable += 1
    }
  }
  if (goal <= 0 || usable === 0 || hours <= 0) return null
  return { unit: 'TON', goal, bidRate: goal / hours }
}

export function buildRealizedReport(project, days, delayRows, excluded, reasons, breaks, today, measure) {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const start = project.start_date ? project.start_date.slice(0, 10) : '2000-01-01'
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

  const included = sorted.filter((d) => !excluded.has(d.date))
  const produced = included.reduce((a, d) => a + d.cy, 0)
  const toDate = baselineCy + produced
  const totalGoh = included.reduce((a, d) => a + d.goh, 0)
  const totalNoh = included.reduce((a, d) => a + (d.noh ?? 0), 0)
  const currentRate = rate(produced, totalGoh)
  const cyPerNoh = rate(produced, totalNoh)
  const pctComplete = goal > 0 ? toDate / goal : 0

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

  const projectionAnchor = addDaysISO(mondayStartISO(today), -1)
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

  const delayTotalHours = delayRows.reduce((a, r) => a + (Number(r.hours) || 0), 0)
  const delaySummary = [...delayRows]
    .map((r) => ({
      description: r.code || r.category || 'Uncategorized',
      hours: Number(r.hours) || 0,
      pct: delayTotalHours > 0 ? (Number(r.hours) || 0) / delayTotalHours : 0,
    }))
    .sort((a, b) => b.hours - a.hours)

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
