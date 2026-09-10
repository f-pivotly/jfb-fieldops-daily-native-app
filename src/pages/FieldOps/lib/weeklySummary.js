import { downloadAttachment } from '../../../data'
import { blobToDataUri, rate } from './realizedToDate'

export async function buildPhotoAssetsParam(photos, weekStart) {
  const weekPhotos = photos.filter((p) => p.week_start === weekStart && p.photo_file_path)

  const entries = await Promise.all(
    weekPhotos.map(async (p) => {
      const blob = await downloadAttachment(p.photo_file_path)
      const dataUri = await blobToDataUri(blob)
      return [String(p.photo_number), { label: p.label || `Photo ${p.photo_number}`, dataUri }]
    }),
  )
  return Object.fromEntries(entries)
}

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

export function buildWeeklyReport({ project, weekStart, reports, sections, contentRows, dailyTotals, delayRows }) {
  const weekEnd = weekEndISO(weekStart)
  const inWeek = (d) => d >= weekStart && d <= weekEnd

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

  const weekDays = dailyTotals.filter((d) => inWeek(d.report_date))
  const weekCy = weekDays.reduce((a, d) => a + Number(d.cy || 0), 0)
  const weekSf = weekDays.reduce((a, d) => a + Number(d.sf || 0), 0)
  const weekGoh = weekDays.reduce((a, d) => a + Number(d.goh || 0), 0)
  const weekNoh = weekDays.reduce((a, d) => a + Number(d.noh || 0), 0)
  const weekCyPerGoh = rate(weekCy, weekGoh)

  const toDateCy = dailyTotals.reduce((a, d) => a + Number(d.cy || 0), 0)
  const goal = project?.volume_goal ?? 0
  const pctComplete = goal > 0 ? toDateCy / goal : 0

  const bidRate = project?.cy_goh_goal ?? 0
  const expGoh = project?.expected_goh_per_day
  const anticipatedDailyProduction = expGoh != null && bidRate > 0 ? bidRate * expGoh : null
  const weekProductionDays = weekDays.length
  const toDateProductionDays = dailyTotals.length
  const plannedWeekCy = anticipatedDailyProduction != null ? anticipatedDailyProduction * weekProductionDays : null
  const plannedToDateCy = anticipatedDailyProduction != null ? anticipatedDailyProduction * toDateProductionDays : null
  const weekVariance = plannedWeekCy != null ? weekCy - plannedWeekCy : null
  const toDateVariance = plannedToDateCy != null ? toDateCy - plannedToDateCy : null

  const delayTotalHours = delayRows.reduce((a, r) => a + (Number(r.hours) || 0), 0)
  const delaySummary = [...delayRows]
    .map((r) => ({
      description: r.code || r.category || 'Uncategorized',
      hours: Number(r.hours) || 0,
      pct: delayTotalHours > 0 ? (Number(r.hours) || 0) / delayTotalHours : 0,
    }))
    .sort((a, b) => b.hours - a.hours)

  return {
    weekStart,
    weekEnd,
    releasedCount: releasedReports.length,
    unit: project?.primary_measure || 'CY',
    sections: sectionReports,
    production: {
      weekCy,
      weekSf,
      weekGoh,
      weekNoh,
      weekCyPerGoh,
      toDateCy,
      goal,
      pctComplete,
      anticipatedDailyProduction,
      plannedWeekCy,
      plannedToDateCy,
      weekVariance,
      toDateVariance,
    },
    delaySummary,
    delayTotalHours,
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
