import { fetchDomainRecords, fetchPicklistValues, downloadAttachment, executeDataView } from '../../../data'
import { renderWeeklyProgressCharts } from '../../../lib/dredge/weeklyChart'
import { mondayStartISO } from './realizedToDate'

function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function buildPhotoAssetsParam({ appSlug, reportId }) {
  const photosRes = await fetchDomainRecords({
    domain: 'jfb_report_photos', system: 'core', appSlug,
    filters: { report_id: reportId }, limit: 50,
  })
  const photos = (photosRes?.data ?? []).filter((p) => p.photo_file_path)

  const entries = await Promise.all(
    photos.map(async (p) => {
      const blob = await downloadAttachment(p.photo_file_path)
      const dataUri = await blobToDataUri(blob)
      return [String(p.photo_number), { label: p.label || `Photo ${p.photo_number}`, dataUri }]
    }),
  )
  return Object.fromEntries(entries)
}

// Keyed by equipment_id, matching how the report template looks up
// dailyActivityByEquipment -- `{{#with (lookup ../parameters.dredgeChartAssets this.id)}}`
// inside its {{#each equipment}} loop.
export async function buildDredgeChartAssetsParam({ appSlug, reportId }) {
  const progressRes = await fetchDomainRecords({
    domain: 'jfb_dredge_progress', system: 'core', appSlug,
    filters: { report_id: reportId }, limit: 50,
  })
  const rows = (progressRes?.data ?? []).filter((r) => r.chart_path)

  const entries = await Promise.all(
    rows.map(async (r) => {
      const blob = await downloadAttachment(r.chart_path)
      const dataUri = await blobToDataUri(blob)
      return [String(r.equipment_id), { dataUri }]
    }),
  )
  return Object.fromEntries(entries)
}

// Keyed by equipment_id, same lookup convention as buildDredgeChartAssetsParam
// -- `{{#with (lookup ../parameters.weeklyChartAssets this.id)}}` inside the
// weekly report's own {{#each equipment}} loop. Unlike the daily chart (which
// re-serves the PE's saved chart_path attachment for that one day), the
// weekly chart is a fresh client-side render every time -- "this week
// highlighted over prior" can't be reconstructed from any single stored PNG.
export async function buildWeeklyChartAssetsParam({ appSlug, projectId, weekStart, weekEnd }) {
  return renderWeeklyProgressCharts({ appSlug, projectId, weekStartISO: weekStart, weekEndISO: weekEnd })
}

export async function buildNarrativeSectionsParam({ appSlug, projectId, reportId }) {
  const [sectionRes, contentRes] = await Promise.all([
    fetchDomainRecords({ domain: 'jfb_project_report_narratives', system: 'core', appSlug, filters: { project_id: projectId }, limit: 1000 }),
    fetchDomainRecords({ domain: 'jfb_report_narratives_v2', system: 'core', appSlug, filters: { report_id: reportId }, limit: 1000 }),
  ])
  const sections = (sectionRes?.data ?? [])
    .filter((r) => r.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const contentByLabel = new Map((contentRes?.data ?? []).map((c) => [c.narrative_label, c.content]))

  return sections.map((s) => ({
    label: s.narrative_label,
    content: (contentByLabel.get(s.narrative_label) ?? '').trim(),
  }))
}

function hhmm(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function durationMinutes(startISO, endISO) {
  if (!startISO || !endISO) return null
  const ms = new Date(endISO) - new Date(startISO)
  if (ms <= 0) return null
  return Math.round(ms / 60000)
}

export function sameCalendarDay(iso, dateISO, timeZone) {
  if (!iso || !dateISO) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const local = timeZone
    ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return local === dateISO
}

function resolveDelayCode(delayCodeId, projectDelayCodeById, masterDelayCodeById) {
  if (!delayCodeId) return '—'
  const row = projectDelayCodeById.get(delayCodeId)
  if (!row) return '—'
  const master = row.delay_code_id ? masterDelayCodeById.get(row.delay_code_id) : null
  return (master ? master.code : row.code) || '—'
}

export function utcDayRange(dateISO) {
  const start = new Date(`${dateISO}T00:00:00.000Z`)
  const gte = new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const lt = new Date(start.getTime() + 48 * 60 * 60 * 1000).toISOString()
  return { gte, lt }
}

// Matches the two productive-tile labels workType.js writes -- everything
// else on jfb_daily_activities.category is a delay code's own text, and a
// null category with no delay_code_id is a legacy row saved before the
// category column existed.
const PRODUCTIVE_CATEGORIES = new Set(['ACTIVE DREDGING', 'ACTIVE PLACEMENT'])

function isProductiveActivity(a) {
  if (a.category && PRODUCTIVE_CATEGORIES.has(a.category)) return true
  return !a.category && !a.delay_code_id
}

// Ported from the non-native app's buildDelaySummary (loadProductionSheetData.ts):
// groups an equipment's non-productive activities by label, with the
// chronologically first/last STARTUP/SHUTDOWN-category row broken out into
// its own "Startup"/"ShutDown" row (native's operator app auto-gap feature
// writes this exact category value). Sorted by minutes descending.
function buildDelaySummary(activities, projectDelayCodeById, masterDelayCodeById) {
  const sorted = activities.slice().sort((x, y) => new Date(x.start_date_time) - new Date(y.start_date_time))
  const delays = sorted.filter((a) => !isProductiveActivity(a))
  if (delays.length === 0) return []

  const ssEvents = delays.filter((a) => a.category === 'STARTUP/SHUTDOWN')
  const firstSS = ssEvents[0] ?? null
  const lastSS = ssEvents.length > 1 ? ssEvents[ssEvents.length - 1] : null

  const totals = new Map()
  let totalMinutes = 0
  for (const a of delays) {
    const minutes = durationMinutes(a.start_date_time, a.end_date_time) ?? 0
    totalMinutes += minutes
    let label
    if (a === firstSS) label = 'Startup'
    else if (a === lastSS) label = 'ShutDown'
    else label = a.category || resolveDelayCode(a.delay_code_id, projectDelayCodeById, masterDelayCodeById)
    totals.set(label, (totals.get(label) ?? 0) + minutes)
  }

  return Array.from(totals.entries())
    .map(([description, minutes]) => ({
      description,
      minutes,
      percent: totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes)
}

// Dominant operator (most logged minutes that day) + shift bounds (earliest
// start / latest end) for one equipment's activities. Free byproduct of the
// activity rows buildDailyActivityByEquipmentParam already fetches -- no
// extra data view needed, just an operator id -> name map.
function summarizeOperatorShift(rows, operatorNameById) {
  if (rows.length === 0) return { operator: '—', shiftFrom: '—', shiftTo: '—' }
  const minutesByOperator = new Map()
  let earliest = rows[0].start_date_time
  let latest = rows[0].end_date_time
  for (const a of rows) {
    if (a.start_date_time < earliest) earliest = a.start_date_time
    if (a.end_date_time && a.end_date_time > (latest ?? '')) latest = a.end_date_time
    if (!a.operator_id) continue
    const minutes = durationMinutes(a.start_date_time, a.end_date_time) ?? 0
    minutesByOperator.set(a.operator_id, (minutesByOperator.get(a.operator_id) ?? 0) + minutes)
  }
  let dominantId = null
  let dominantMinutes = -1
  for (const [id, minutes] of minutesByOperator) {
    if (minutes > dominantMinutes) { dominantId = id; dominantMinutes = minutes }
  }
  return {
    operator: dominantId ? (operatorNameById.get(dominantId) ?? '—') : '—',
    shiftFrom: hhmm(earliest),
    shiftTo: latest ? hhmm(latest) : '—',
  }
}

// Returns { activitiesByEquipment, delaySummaryByEquipment, opSummaryByEquipment },
// all keyed by equipment_id -- the report template looks up each the same way,
// e.g. `{{#with (lookup ../parameters.dailyActivityByEquipment this.id)}}`.
export async function buildDailyActivityByEquipmentParam({ appSlug, projectId, dateISO }) {
  const { gte, lt } = utcDayRange(dateISO)

  const [activityRes, areaLabelRows, projectDelayRes, masterDelayRes, passTypeRows, operatorRes] = await Promise.all([
    fetchDomainRecords({
      domain: 'jfb_daily_activities', system: 'core', appSlug,
      filters: { project_id: projectId, start_date_time: { gte, lt } },
      limit: 1000,
    }),
    // Server-side equivalent of the old resolveArea()/areaNameById join --
    // resolves area/sub_area/sub_sub_area uuids to jfb_project_areas.name
    // in one query. Date range padded the same as the activity fetch above
    // so it covers every row sameCalendarDay() might keep after filtering.
    executeDataView('dvw-jfb-activity-area-labels', {
      p_project_id: projectId,
      p_start_date: gte.slice(0, 10),
      p_end_date: lt.slice(0, 10),
    }),
    fetchDomainRecords({ domain: 'jfb_project_delay_codes', system: 'core', appSlug, filters: { project_id: projectId }, limit: 1000 }),
    fetchDomainRecords({ domain: 'jfb_delay_codes', system: 'core', appSlug, limit: 1000 }),
    fetchPicklistValues('pkl-jfb-pass-type'),
    fetchDomainRecords({ domain: 'jfb_operators', system: 'core', appSlug, limit: 500 }),
  ])

  const areaLabelByActivityId = new Map(
    (areaLabelRows ?? []).map((r) => [r.activity_id, [r.area_l1, r.area_l2, r.area_l3].filter(Boolean).join(' / ') || '—']),
  )
  const projectDelayCodeById = new Map((projectDelayRes?.data ?? []).map((r) => [r.id, r]))
  const masterDelayCodeById = new Map((masterDelayRes?.data ?? []).map((r) => [r.id, r]))
  const passTypeLabels = Object.fromEntries(
    (passTypeRows || []).filter((r) => r.is_active !== false).map((r) => [r.value, r.label ?? r.value]),
  )
  const operatorNameById = new Map((operatorRes?.data ?? []).map((o) => [o.id, o.name]))

  const activities = (activityRes?.data ?? []).filter((a) => sameCalendarDay(a.start_date_time, dateISO, a.timezone))

  const byEquipment = new Map()
  for (const a of activities) {
    if (!byEquipment.has(a.equipment_id)) byEquipment.set(a.equipment_id, [])
    byEquipment.get(a.equipment_id).push(a)
  }

  const activitiesByEquipment = {}
  const delaySummaryByEquipment = {}
  const opSummaryByEquipment = {}
  for (const [equipmentId, rows] of byEquipment) {
    const sorted = rows.slice().sort((x, y) => new Date(x.start_date_time) - new Date(y.start_date_time))
    activitiesByEquipment[equipmentId] = sorted.map((a, i) => ({
      num: i + 1,
      from: hhmm(a.start_date_time),
      to: hhmm(a.end_date_time),
      minutes: durationMinutes(a.start_date_time, a.end_date_time) ?? '—',
      area: areaLabelByActivityId.get(a.id) ?? '—',
      pass: a.pass_type ? (passTypeLabels[a.pass_type] ?? a.pass_type) : '—',
      // Prefer the persisted category (the productive-tile label or delay
      // code text, set at save time by the operator/admin apps); fall back
      // to resolving delay_code_id directly for rows saved before category
      // existed.
      event: a.category || resolveDelayCode(a.delay_code_id, projectDelayCodeById, masterDelayCodeById),
      notes: a.notes || '',
    }))
    delaySummaryByEquipment[equipmentId] = buildDelaySummary(rows, projectDelayCodeById, masterDelayCodeById)
    opSummaryByEquipment[equipmentId] = summarizeOperatorShift(sorted, operatorNameById)
  }
  return { activitiesByEquipment, delaySummaryByEquipment, opSummaryByEquipment }
}

function fmtHrs(n) {
  return (n ?? 0).toFixed(2)
}
function fmtPct(n) {
  return n == null ? '—' : `${Math.round(n)}%`
}
function fmtNum(n) {
  return Math.round(n ?? 0).toLocaleString()
}

// One equipment's GOH/NOH/Delay/Efficiency/Area/Volume for one date range,
// via the already-published per-project/per-equipment metric data views
// (same ones the on-screen Metrics tab uses) -- no new SQL needed.
//
// Deliberately does NOT call dvw-jfb-goh: its optional area/pass_type/tsca/
// attachment_id filters use `IS NOT DISTINCT FROM`, which (unlike
// p_equipment_id's `IS NULL OR ...`) treats an omitted/NULL filter as "match
// only rows where this field is ALSO NULL" rather than "don't filter on
// this" -- confirmed by testing against real data: every real activity has a
// non-null area/pass_type/tsca/attachment_id, so an unscoped call silently
// returned 0. dvw-jfb-goh is built for the combo-scoped drill-down (a
// specific area/pass/tsca/attachment combination), not a plain equipment
// total. GOH (every activity, productive or not) is instead derived as
// noh + delay, which are exhaustive and mutually exclusive by construction
// (dvw-jfb-metric-hours-op/-delay split on the same category check, no
// third bucket) and have no such extra-filter footgun.
async function fetchEquipmentMetrics({ projectId, equipmentId, startDate, endDate }) {
  const p = { p_project_id: projectId, p_start_date: startDate, p_end_date: endDate, p_equipment_id: equipmentId }
  const [noh, delay, efficiency, cy, sf] = await Promise.all([
    executeDataView('dvw-jfb-metric-hours-op', p),
    executeDataView('dvw-jfb-metric-hours-delay', p),
    executeDataView('dvw-jfb-metric-efficiency', p),
    executeDataView('dvw-jfb-metric-cy', p),
    executeDataView('dvw-jfb-metric-sf', p),
  ])
  const nohHours = Number(noh?.[0]?.op_hours ?? 0)
  const delayHours = Number(delay?.[0]?.delay_hours ?? 0)
  return {
    goh: fmtHrs(nohHours + delayHours),
    noh: fmtHrs(nohHours),
    delay: fmtHrs(delayHours),
    efficiency: fmtPct(efficiency?.[0]?.efficiency_pct != null ? Number(efficiency[0].efficiency_pct) : null),
    area: fmtNum(Number(sf?.[0]?.total_area ?? 0)),
    volume: fmtNum(Number(cy?.[0]?.total_volume ?? 0)),
  }
}

// Day/Week/Project-Total GOH/NOH/Delay/Efficiency/Area/Volume per equipment,
// keyed by equipment_id -- fills in the Production Report sheet's "Daily
// Production Totals by Activity" box, which previously shipped as hardcoded
// em-dashes despite these exact metric views already existing (built for the
// on-screen Metrics tab, never wired into this PDF). Week = Monday of this
// report's week through the report date (running total, not the full
// Mon-Sun span); Project = the project's production/start date through the
// report date -- same "to-date" floor convention as Realized To-Date and
// Weekly Summary.
export async function buildProductionStatsByEquipmentParam({ projectId, project, dateISO, equipmentIds }) {
  const weekStart = mondayStartISO(dateISO)
  const projectStart = project?.production_start_date || (project?.start_date ? project.start_date.slice(0, 10) : '2000-01-01')

  const entries = await Promise.all(
    equipmentIds.map(async (equipmentId) => {
      const [day, week, project_] = await Promise.all([
        fetchEquipmentMetrics({ projectId, equipmentId, startDate: dateISO, endDate: dateISO }),
        fetchEquipmentMetrics({ projectId, equipmentId, startDate: weekStart, endDate: dateISO }),
        fetchEquipmentMetrics({ projectId, equipmentId, startDate: projectStart, endDate: dateISO }),
      ])
      return [equipmentId, { day, week, project: project_ }]
    }),
  )
  return Object.fromEntries(entries)
}

// Whole-project (all equipment) Day/Week/Project-Total production volume,
// via the same dvw-jfb-metric-cy view -- fills the cover page's "Project
// Production Table" Week/Project Total columns, which previously shipped
// hardcoded. Per-pass-value breakdowns for Week/Project aren't available
// without a new grouped-by-pass data view (out of scope here), so this adds
// one honest "Total (All Passes)" row rather than fabricating per-row totals.
export async function buildCoverProductionTotalsParam({ projectId, project, dateISO }) {
  const weekStart = mondayStartISO(dateISO)
  const projectStart = project?.production_start_date || (project?.start_date ? project.start_date.slice(0, 10) : '2000-01-01')
  const p = (startDate) => ({ p_project_id: projectId, p_start_date: startDate, p_end_date: dateISO, p_equipment_id: null })

  const [day, week, proj] = await Promise.all([
    executeDataView('dvw-jfb-metric-cy', p(dateISO)),
    executeDataView('dvw-jfb-metric-cy', p(weekStart)),
    executeDataView('dvw-jfb-metric-cy', p(projectStart)),
  ])
  return {
    day: fmtNum(Number(day?.[0]?.total_volume ?? 0)),
    week: fmtNum(Number(week?.[0]?.total_volume ?? 0)),
    project: fmtNum(Number(proj?.[0]?.total_volume ?? 0)),
  }
}

// Ported from the non-native app's validateForPdf: blocks PDF generation
// until narratives are filled, at least 2 photos are uploaded, every photo
// has a label, and no photo is an unconvertible HEIC/HEIF file. Reuses the
// already-built narrativeSections param so narrative content isn't fetched
// twice.
export async function validatePdfIssues({ appSlug, reportId, narrativeSections }) {
  const issues = []

  const emptyNarrs = narrativeSections.filter((n) => !n.content.trim())
  if (emptyNarrs.length > 0) {
    issues.push({
      key: 'narratives_incomplete',
      message: `Narrative sections missing content: ${emptyNarrs.map((n) => n.label).join(', ')}`,
    })
  }

  const photosRes = await fetchDomainRecords({
    domain: 'jfb_report_photos', system: 'core', appSlug,
    filters: { report_id: reportId }, limit: 50,
  })
  const photos = (photosRes?.data ?? []).filter((p) => p.photo_file_path)

  if (photos.length < 2) {
    issues.push({
      key: 'photos_missing',
      message: `Two photos required — ${photos.length} uploaded.`,
    })
  } else {
    const unlabeled = photos.filter((p) => !p.label?.trim())
    if (unlabeled.length > 0) {
      issues.push({
        key: 'photo_labels_missing',
        message: `Photo${unlabeled.length === 1 ? '' : 's'} missing label: slot ${unlabeled.map((p) => p.photo_number).join(', slot ')}`,
      })
    }
    const heic = photos.filter((p) => /\.(heic|heif)$/i.test(p.photo_file_path || ''))
    if (heic.length > 0) {
      issues.push({
        key: 'heic_photo_pending',
        message: `HEIC photo on slot ${heic.map((p) => p.photo_number).join(', slot ')} cannot be embedded; convert to JPEG or re-upload.`,
      })
    }
  }

  return issues
}

function naOr(value) {
  const trimmed = typeof value === 'string' ? value.trim() : value
  return trimmed || 'N/A'
}

// "75 °F" / "0.30 IN" / "—" when null -- matches the reference app's PDF
// ClimateSubRow fallback exactly (an em dash, distinct from the "N/A" the
// Daily Safety Updates rows use).
function fmtClimate(value, unit, decimals) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return `${decimals != null ? num.toFixed(decimals) : Math.round(num)} ${unit}`
}

// Builds the one caller-resolved parameter the report template binds its
// whole Safety page to -- same "resolve client-side, pass as JSON" pattern
// as narrativeSections/dailyActivityByEquipment above, chosen for the same
// reason: Culture Tenant needs a join (report_safety.culture_tenant_id ->
// culture_tenants), Equipment needs an as-of-this-date mobilize/demob
// window filter, and Precip MTD/Project Total need a project-lifetime sum
// -- none expressible as a single domain-query source or in this engine's
// Handlebars (no eq/date-math helpers), so all three are resolved here
// via the same dvw-jfb-precip-sums data view SafetyTab.jsx itself calls.
export async function buildSafetyPageDataParam({ appSlug, projectId, reportId, dateISO, project }) {
  const [safetyRes, cultureRes, crewRes, equipmentRes, categoryLabelRows, precipSumRows, crewHoursRows] = await Promise.all([
    fetchDomainRecords({ domain: 'jfb_report_safety_v2', system: 'core', appSlug, filters: { report_id: reportId }, limit: 1 }),
    fetchDomainRecords({ domain: 'jfb_culture_tenants', system: 'core', appSlug, limit: 200 }),
    fetchDomainRecords({ domain: 'jfb_report_crew_summary_v2', system: 'core', appSlug, filters: { report_id: reportId }, limit: 200 }),
    fetchDomainRecords({ domain: 'jfb_project_site_equipment', system: 'core', appSlug, filters: { project_id: projectId }, limit: 1000 }),
    fetchPicklistValues('pkl-jfb-site-equipment-category'),
    executeDataView('dvw-jfb-precip-sums', {
      p_project_id: projectId, p_month_start: `${dateISO.slice(0, 7)}-01`, p_end_date: dateISO,
    }),
    executeDataView('dvw-jfb-crew-hours-total', { p_project_id: projectId }),
  ])

  const safety = (safetyRes?.data ?? [])[0] ?? null
  const tenant = safety?.culture_tenant_id
    ? (cultureRes?.data ?? []).find((t) => t.id === safety.culture_tenant_id)
    : null
  const categoryLabels = Object.fromEntries(
    (categoryLabelRows || []).filter((r) => r.is_active !== false).map((r) => [r.value, r.label ?? r.value]),
  )

  const crewRows = (crewRes?.data ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => ({ category: r.category || '—', count: r.count ?? 0, hours: Number(r.hours) || 0 }))

  // "On site" = mobilized on/before this report's date and not yet
  // demobilized (or demobilized on/after this date) -- same window
  // SiteEquipmentTab's own mobilize/demobilize fields define.
  const equipmentRows = (equipmentRes?.data ?? [])
    .filter((r) => {
      if (!r.mobilized_at || r.mobilized_at > dateISO) return false
      if (r.demobilized_at && r.demobilized_at < dateISO) return false
      return true
    })
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => ({ category: categoryLabels[r.category] ?? r.category, description: r.description || '' }))

  const [preparerSignatureDataUri, sshoSignatureDataUri] = await Promise.all([
    safety?.signature_image_path
      ? downloadAttachment(safety.signature_image_path).then(blobToDataUri)
      : Promise.resolve(null),
    safety?.ssho_signature_image_path
      ? downloadAttachment(safety.ssho_signature_image_path).then(blobToDataUri)
      : Promise.resolve(null),
  ])

  // Project-lifetime crew-hours totals, PDF-only (not shown anywhere on
  // screen) -- mirrors the reference app's SafetyPage.tsx crewTotals
  // exactly: todayHours/totalCount from this report's own crew rows,
  // totalProjectHours from summing every crew row the project has ever
  // had (dvw-jfb-crew-hours-total, no date filter, matching
  // fetchProjectCrewHistory's own project_id-only scope), and
  // previousProjectHours = max(0, total - today).
  const todayHours = crewRows.reduce((sum, r) => sum + r.hours, 0)
  const totalCount = crewRows.reduce((sum, r) => sum + r.count, 0)
  const totalProjectHours = Number(crewHoursRows?.[0]?.total_hours) || 0
  const previousProjectHours = Math.max(0, totalProjectHours - todayHours)
  const crewTotals = {
    totalCount: String(totalCount),
    todayHours: todayHours.toFixed(0),
    previousProjectHours: previousProjectHours.toLocaleString('en-US', { maximumFractionDigits: 0 }),
    totalProjectHours: totalProjectHours.toLocaleString('en-US', { maximumFractionDigits: 0 }),
  }

  const precipSums = precipSumRows?.[0] ?? {}
  const climate = {
    windHeader: safety?.wind_direction ? `Wind · ${safety.wind_direction}` : 'Wind',
    tempHigh: fmtClimate(safety?.temp_high_f, '°F'),
    tempLow: fmtClimate(safety?.temp_low_f, '°F'),
    windHigh: fmtClimate(safety?.wind_high_mph, 'MPH'),
    windGusts: fmtClimate(safety?.wind_gusts_mph, 'MPH'),
    windAvg: fmtClimate(safety?.wind_avg_mph, 'MPH'),
    precipToday: fmtClimate(safety?.precip_today_in, 'IN', 2),
    precipMtd: fmtClimate(precipSums.mtd_in, 'IN', 2),
    precipProjectTotal: fmtClimate(precipSums.ptd_in, 'IN', 2),
    conditions: safety?.conditions?.trim() || '—',
  }

  return {
    jhaAhaReviewed: naOr(safety?.jha_aha_reviewed),
    highRiskTask: naOr(safety?.high_risk_task),
    toolboxTopic: naOr(safety?.safety_meeting_topic),
    afternoonTopic: naOr(safety?.afternoon_meeting_topic),
    incidents: naOr(safety?.incidents_to_report),
    cultureTenantLabel: tenant ? `${tenant.name}: ${tenant.description ?? ''}` : 'N/A',
    planOfDay: naOr(safety?.plan_of_day),
    showNextDaySummary: !!project?.show_next_day_summary,
    nextDaySummary: naOr(safety?.next_day_summary),
    crewRows,
    crewTotals,
    equipmentRows,
    climate,
    showSsho: !!project?.show_ssho_field,
    preparerName: naOr(safety?.signature_name),
    preparerSignatureDataUri,
    sshoName: naOr(safety?.ssho_name),
    sshoSignatureDataUri,
  }
}

// Ported from the non-native app's live-computed ChecklistState. Two
// adaptations forced by schema differences, noted where they diverge:
// native has no "UNATTRIBUTED" gap-marker category, so event_log_reviewed
// only checks that activities exist for the day (reference also requires
// zero unresolved gap placeholders); transitions_added is permanently true
// on both apps since native has no TRANSITION marker-event concept at all.
export async function buildCompletionChecklist({ appSlug, projectId, reportId, dateISO }) {
  const { gte, lt } = utcDayRange(dateISO)

  const [activityRes, narrativeSections, photosRes, productionRes, metricsRes, metricValuesRes] = await Promise.all([
    fetchDomainRecords({
      domain: 'jfb_daily_activities', system: 'core', appSlug,
      filters: { project_id: projectId, start_date_time: { gte, lt } },
      limit: 1000,
    }),
    buildNarrativeSectionsParam({ appSlug, projectId, reportId }),
    fetchDomainRecords({ domain: 'jfb_report_photos', system: 'core', appSlug, filters: { report_id: reportId }, limit: 50 }),
    fetchDomainRecords({ domain: 'jfb_production_stats', system: 'core', appSlug, filters: { report_id: reportId }, limit: 500 }),
    fetchDomainRecords({ domain: 'jfb_metrics', system: 'core', appSlug, filters: { project_id: projectId }, limit: 200 }),
    fetchDomainRecords({ domain: 'jfb_report_metric_value', system: 'core', appSlug, filters: { report_id: reportId }, limit: 200 }),
  ])

  const activities = (activityRes?.data ?? []).filter((a) => sameCalendarDay(a.start_date_time, dateISO, a.timezone))

  const photos = (photosRes?.data ?? []).filter((p) => p.photo_file_path)
  const acceptedPhotos = photos.filter((p) => p.label?.trim() && !p.pm_comment).length

  const production = productionRes?.data ?? []
  const productionEntered = production.filter((p) => p.volume !== null && p.volume !== undefined).length

  const manualMetrics = (metricsRes?.data ?? []).filter((m) => m.source === 'manual' && m.active !== false)
  const manualMetricIds = new Set(manualMetrics.map((m) => m.id))
  const metricValues = (metricValuesRes?.data ?? []).filter(
    (v) => manualMetricIds.has(v.metric_id) && v.value !== null && v.value !== undefined && v.value !== '',
  )

  const narrativesFilled = narrativeSections.filter((s) => s.content.trim().length > 0).length

  return {
    event_log_reviewed: activities.length > 0,
    transitions_added: true,
    production_stats_entered: productionEntered > 0,
    photos_complete: acceptedPhotos >= 2,
    narratives_complete: narrativeSections.length > 0 && narrativesFilled >= narrativeSections.length,
    metrics_entered: manualMetrics.length === 0 || metricValues.length >= manualMetrics.length,
  }
}
