import { fetchDomainRecords } from '../../../../data'

const MAX_PRIOR_REPORT_CANDIDATES = 15

// Last-resort seed when a project has no prior report with any crew rows
// at all. Mirrors the reference app's DEFAULT_CREW_CATEGORIES (db.ts) --
// category + sort_order only; count/hours always start at 0.
export const DEFAULT_CREW_CATEGORY_SEED = [
  { category: 'Brennan Management, Survey, Safety', sort_order: 10 },
  { category: 'Brennan Dredge Crew', sort_order: 20 },
  { category: 'Subcontractors', sort_order: 30 },
  { category: 'Mechanics', sort_order: 40 },
]

// Prior reports for the same project, most recent first, capped like the
// reference app's report_dates lookups (fetchMostRecentCrewCategoriesBefore
// / fetchMostRecentCrewSummaryBefore both use .limit(15)).
export function priorReportsFor(reports, report) {
  if (!report?.report_date) return []
  return reports
    .filter((r) => r.id !== report.id && r.report_date && r.report_date < report.report_date)
    .sort((a, b) => (a.report_date < b.report_date ? 1 : -1))
    .slice(0, MAX_PRIOR_REPORT_CANDIDATES)
}

export async function fetchCrewRowsForReport(reportId, appSlug) {
  const res = await fetchDomainRecords({
    domain: 'jfb_report_crew_summary_v2', system: 'core', appSlug,
    filters: { report_id: reportId }, limit: 1000,
  })
  return Array.isArray(res) ? res : (res?.data ?? [])
}

// Mirrors fetchMostRecentCrewCategoriesBefore: walks backward through
// prior reports and returns the first one with any crew rows at all,
// keeping only category + sort_order (not count/hours) -- used to seed a
// brand-new report's crew categories.
export async function findMostRecentCrewCategories(candidates, appSlug) {
  for (const r of candidates) {
    const rows = await fetchCrewRowsForReport(r.id, appSlug)
    if (rows.length > 0) {
      return rows.map((row) => ({ category: row.category, sort_order: row.sort_order ?? 0 }))
    }
  }
  return null
}

// Mirrors fetchMostRecentCrewSummaryBefore: walks backward through prior
// reports and returns the first one with at least one hours>0 row,
// skipping all-zero "off day" reports -- used by the "Use crew from M/D"
// pre-fill button.
export async function findMostRecentCrewSummary(candidates, appSlug) {
  for (const r of candidates) {
    const rows = await fetchCrewRowsForReport(r.id, appSlug)
    if (rows.some((row) => (Number(row.hours) || 0) > 0)) {
      return { rows, reportDate: r.report_date }
    }
  }
  return null
}

export async function fetchSafetyRowForReport(reportId, appSlug) {
  const res = await fetchDomainRecords({
    domain: 'jfb_report_safety_v2', system: 'core', appSlug,
    filters: { report_id: reportId }, limit: 1,
  })
  const rows = Array.isArray(res) ? res : (res?.data ?? [])
  return rows[0] ?? null
}

// Mirrors fetchMostRecentPlanOfDayBefore: walks backward through prior
// reports and returns the first one with a non-blank plan_of_day -- used
// by the "Use plan from M/D" pre-fill button.
export async function findMostRecentPlanOfDay(candidates, appSlug) {
  for (const r of candidates) {
    const row = await fetchSafetyRowForReport(r.id, appSlug)
    if (row?.plan_of_day?.trim()) {
      return { content: row.plan_of_day, reportDate: r.report_date }
    }
  }
  return null
}

export async function fetchUserSignature(userId, appSlug) {
  if (!userId) return null
  const res = await fetchDomainRecords({
    domain: 'jfb_user_signatures', system: 'core', appSlug,
    filters: { user_id: userId }, limit: 1,
  })
  const rows = Array.isArray(res) ? res : (res?.data ?? [])
  return rows[0] ?? null
}

export function formatMonthDay(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateISO
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}
