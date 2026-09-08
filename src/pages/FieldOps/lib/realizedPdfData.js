// Realized To-Date PDF param building. Shapes a computed RealizedReport (see
// realizedToDate.js) into the parameters rpt-jfb-realized-to-date.json's
// Handlebars template expects, and renders the two charts as inline SVG
// markup passed through as unescaped strings.
//
// The reference app generates this PDF entirely client-side via
// @react-pdf/renderer -- its two charts (RealizedToDateDocument.tsx's
// DailyBarChart / CumulativeChart) are already just react-pdf's <Svg>/<Rect>/
// <Polyline>/<Circle> primitives, i.e. plain SVG geometry with no
// react-pdf-specific behavior. Since the Report Engine renders HTML (which
// natively embeds <svg>) to PDF, that same coordinate math is ported here
// to build real SVG strings instead -- no canvas/rasterization needed, and
// no image-asset upload step like the Dredge/Weekly chart PNGs use, because
// this is vector data the engine can render directly.

const BRENNAN_NAVY = '#002f6d'
const GOAL_COLOR = '#e0a800' // amber -- goal bars / planned-pace line
const FORECAST_COLOR = '#2563eb' // bright blue -- overall-rate forecast line

function num(n) {
  return Math.round(n ?? 0).toLocaleString()
}
function rate(n) {
  return (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })
}
function hrs(n) {
  return (n ?? 0).toFixed(2)
}
function shortMD(iso) {
  const [, mm, dd] = iso.split('-')
  return `${Number(mm)}/${Number(dd)}`
}

/** Bar chart: this week's CY/day, with an optional bid-goal reference bar
 *  per day. Ported from RealizedToDateDocument.tsx's DailyBarChart. */
export function buildDailyBarChartSvg(bars, bidGoal, plotW = 460, H = 110) {
  const axisW = 30
  const chartW = plotW - axisW
  const maxVal = Math.max(...bars.map((b) => b.cy), bidGoal ?? 0, 1)
  const slot = chartW / Math.max(1, bars.length)
  const hasGoal = bidGoal != null && bidGoal > 0
  const groupW = slot * 0.72
  const barW = hasGoal ? (groupW - 2) / 2 : groupW
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  const gridLines = ticks
    .map((t) => `<line x1="${axisW}" y1="${H - t * H}" x2="${plotW}" y2="${H - t * H}" stroke="#e5e7eb" stroke-width="0.5" />`)
    .join('')
  const yLabels = ticks
    .slice()
    .reverse()
    .map((t, i) => `<text x="${axisW - 3}" y="${(H / (ticks.length - 1)) * i + 4}" font-size="5" fill="#9ca3af" text-anchor="end">${num(maxVal * t)}</text>`)
    .join('')
  const bars_ = bars
    .map((b, i) => {
      const xBase = axisW + i * slot + (slot - groupW) / 2
      const ah = (b.cy / maxVal) * H
      const gh = hasGoal ? (bidGoal / maxVal) * H : 0
      let out = `<rect x="${xBase.toFixed(1)}" y="${(H - ah).toFixed(1)}" width="${barW.toFixed(1)}" height="${ah.toFixed(1)}" fill="${BRENNAN_NAVY}" />`
      if (hasGoal) {
        out += `<rect x="${(xBase + barW + 2).toFixed(1)}" y="${(H - gh).toFixed(1)}" width="${barW.toFixed(1)}" height="${gh.toFixed(1)}" fill="${GOAL_COLOR}" />`
      }
      return out
    })
    .join('')
  const labels = bars
    .map((b, i) => {
      const x = axisW + i * slot + slot / 2
      return `<text x="${x.toFixed(1)}" y="${H + 10}" font-size="6" fill="#6b7280" text-anchor="middle">${b.weekday} ${shortMD(b.date)}</text>`
    })
    .join('')

  return `<svg width="${plotW}" height="${H + 20}" viewBox="0 0 ${plotW} ${H + 20}" xmlns="http://www.w3.org/2000/svg">${gridLines}${yLabels}${bars_}${labels}</svg>`
}

/** Cumulative-vs-goal line chart: navy = actual, amber dashed = bid-pace
 *  projection, blue dashed = overall-rate forecast from the last actual
 *  point. Ported from RealizedToDateDocument.tsx's CumulativeChart. */
export function buildCumulativeChartSvg(points, weeks, goal, goalProjection, rateForecastEndCy, plotW = 540, H = 110) {
  const axisW = 36
  const chartW = plotW - axisW
  const N = Math.max(1, weeks.length)
  const maxY = Math.max(goal, points.length ? points[points.length - 1].cumCy : 0, rateForecastEndCy ?? 0, 1)
  const yticks = [0, 0.25, 0.5, 0.75, 1]
  const xy = points.map((p) => ({ x: axisW + p.xFrac * chartW, y: H - (p.cumCy / maxY) * H }))
  const poly =
    xy.length === 1
      ? `${xy[0].x.toFixed(1)},${xy[0].y.toFixed(1)} ${xy[0].x.toFixed(1)},${xy[0].y.toFixed(1)}`
      : xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const ambPolyPoints = goalProjection
    ? `${axisW},${H.toFixed(1)} ${goalProjection.points
        .map((p) => `${(axisW + p.xFrac * chartW).toFixed(1)},${(H - (p.cumCy / maxY) * H).toFixed(1)}`)
        .join(' ')}`
    : ''

  const gridH = yticks.map((t) => `<line x1="${axisW}" y1="${H - t * H}" x2="${plotW}" y2="${H - t * H}" stroke="#e5e7eb" stroke-width="0.5" />`).join('')
  const gridV = Array.from({ length: N + 1 }, (_, i) => {
    const x = axisW + (i / N) * chartW
    return `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" stroke="#d1d5db" stroke-width="0.5" />`
  }).join('')
  const yLabels = yticks
    .slice()
    .reverse()
    .map((t, i) => `<text x="${axisW - 3}" y="${(H / (yticks.length - 1)) * i + 4}" font-size="5" fill="#9ca3af" text-anchor="end">${num(maxY * t)}</text>`)
    .join('')

  let goalLine = ''
  if (goalProjection && goal > 0 && goalProjection.points.length > 0) {
    goalLine = `<polyline points="${ambPolyPoints}" fill="none" stroke="${GOAL_COLOR}" stroke-width="1.2" stroke-dasharray="4 2" />`
  }
  let forecastLine = ''
  if (rateForecastEndCy != null && xy.length > 0) {
    const last = xy[xy.length - 1]
    const endY = H - (rateForecastEndCy / maxY) * H
    forecastLine = `<polyline points="${last.x.toFixed(1)},${last.y.toFixed(1)} ${plotW.toFixed(1)},${endY.toFixed(1)}" fill="none" stroke="${FORECAST_COLOR}" stroke-width="1.2" stroke-dasharray="2 2" />`
  }
  const actualLine = poly !== '' ? `<polyline points="${poly}" fill="none" stroke="${BRENNAN_NAVY}" stroke-width="1.5" />` : ''
  const dots = xy.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="1.8" fill="${BRENNAN_NAVY}" />`).join('')

  const labelStep = N > 16 ? 2 : 1
  const weekLabels = weeks
    .map((wn, i) => {
      if (i % labelStep !== 0) return ''
      const x = axisW + (i / N) * chartW + chartW / N / 2
      return `<text x="${x.toFixed(1)}" y="${H + 10}" font-size="6" fill="#6b7280" text-anchor="middle">Wk ${wn}</text>`
    })
    .join('')

  return `<svg width="${plotW}" height="${H + 20}" viewBox="0 0 ${plotW} ${H + 20}" xmlns="http://www.w3.org/2000/svg">${gridH}${gridV}${yLabels}${goalLine}${forecastLine}${actualLine}${dots}${weekLabels}</svg>`
}

/** Shapes a computed RealizedReport into the exact parameter object
 *  rpt-jfb-realized-to-date.json's Handlebars template consumes. */
export function buildRealizedReportParams({ report, project, projectCode, generatedISO }) {
  const sm = report.summary
  const u = sm.unit
  const wkCy = report.currentWeekBars.reduce((a, b) => a + b.cy, 0)
  const wkGoh = report.currentWeekBars.reduce((a, b) => a + b.goh, 0)
  const wkAvgRate = wkGoh > 0 ? wkCy / wkGoh : 0
  const maxDelay = report.delaySummary[0]?.hours ?? 1

  const weekRows = report.currentWeekBars.map((b) => ({
    day: b.weekday,
    cy: b.cy > 0 ? num(b.cy) : '',
    goh: b.goh > 0 ? hrs(b.goh) : '',
    rate: b.goh > 0 ? rate(b.cy / b.goh) : '',
  }))

  const projectionRows = report.projections.map((p) => ({
    label: `At ${p.label}`,
    rate: rate(p.rateCyPerGoh),
    daysLeft: p.complete ? '—' : p.workDaysRemaining != null ? String(p.workDaysRemaining) : '—',
    estFinish: p.complete ? 'Complete' : p.estCompletionDate ? p.estCompletionDate : '—',
  }))

  const delayRows = report.delaySummary.map((d) => ({
    description: d.description,
    hours: hrs(d.hours),
    pct: `${(d.pct * 100).toFixed(0)}%`,
    barPct: Math.round((d.hours / maxDelay) * 100),
  }))
  const half = Math.ceil(delayRows.length / 2)

  return {
    projectId: project.id,
    projectFilter: { id: project.id },
    projectName: sm.projectName,
    client: sm.client || '—',
    projectCode: String(projectCode),
    unit: u,
    reportedWeek: report.reportedWeek,
    throughDate: sm.throughDate,
    startDate: sm.startDate,
    generatedDate: generatedISO,

    totalGoh: hrs(sm.totalGoh),
    currentRate: rate(sm.currentRate),
    totalNoh: hrs(sm.totalNoh),
    cyPerNoh: rate(sm.cyPerNoh),

    bidRate: rate(sm.bidRate),
    goal: num(sm.goal),
    toDate: num(sm.toDate),
    plannedLabel: sm.plannedToDate == null ? null : sm.paceByGoh
      ? `Expected at ${rate(sm.bidRate)} ${u}/GOH x ${num(sm.totalGoh)} GOH`
      : `Planned at ${num(sm.anticipatedDailyProduction ?? 0)} ${u}/Day`,
    plannedToDate: sm.plannedToDate == null ? null : num(sm.plannedToDate),
    paceLabel: sm.cyAheadOfPace == null ? null : sm.cyAheadOfPace >= 0 ? `${u} Ahead of Pace` : `${u} Behind Pace`,
    paceValue: sm.cyAheadOfPace == null ? null : `${sm.cyAheadOfPace >= 0 ? '+' : '-'}${num(Math.abs(sm.cyAheadOfPace))}`,
    remaining: num(sm.remaining),
    pctComplete: `${(sm.pctComplete * 100).toFixed(1)}%`,

    forecast: report.forecast
      ? {
          daysAheadBehind: sm.daysAheadBehind == null ? '—' : sm.daysAheadBehind.toFixed(1),
          workDaysRemaining: String(report.forecast.workDaysRemaining),
          estGohRemaining: num(report.forecast.estGohRemaining),
          cyPerDayToMeetGoal: num(report.forecast.cyPerDayToMeetGoal),
        }
      : null,
    planEnabled: sm.planEnabled,

    weekRows,
    weekTotalCy: num(wkCy),
    weekTotalGoh: hrs(wkGoh),
    weekTotalRate: rate(wkAvgRate),

    projectionRows,

    delayRowsLeft: delayRows.slice(0, half),
    delayRowsRight: delayRows.slice(half),
    delayTotalHours: hrs(report.delayTotalHours),
    hasDelays: delayRows.length > 0,

    goalProjectionTargetDate: report.goalProjection ? report.goalProjection.targetDate : null,
    hasRateForecast: report.rateForecastEndCy != null,

    dailyBarChartSvg: buildDailyBarChartSvg(report.currentWeekBars, report.bidGoalPerDay),
    cumulativeChartSvg: buildCumulativeChartSvg(
      report.cumulative, report.cumulativeWeeks, sm.goal, report.goalProjection, report.rateForecastEndCy,
    ),
  }
}
