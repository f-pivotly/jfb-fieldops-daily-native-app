import { fetchDomainRecords, fetchPicklistValues, downloadAttachment, executeDataView } from '../../../data'
import { renderWeeklyProgressCharts } from '../../../lib/dredge/weeklyChart'
import { buildCombosFromActivities, comboNOH, isUnassigned } from '../../../lib/productionCombos'
import { prettyDate } from './realizedToDate'

// Ported from the non-native app's src/lib/dates.ts (isoCalWeek/projectWeekNumber).
// Feeds the cover, production sheet, and safety sheet date tables' Cal. Wk# /
// Prod. Wk# columns, which the CSS (.meta-date-table .weekday,
// .sheet-date-table .weekday) was already built for but the template never
// populated -- these all shipped as hardcoded em-dashes until now.
function isoCalWeek(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dayNum = dt.getUTCDay() || 7 // Sun (0) -> 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1)
  return Math.ceil(((dt.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

function projectWeekNumber(reportDateISO, projectStartRaw) {
  if (!projectStartRaw) return null
  const projectStartISO = projectStartRaw.slice(0, 10)
  const a = new Date(`${projectStartISO}T00:00:00Z`)
  const b = new Date(`${reportDateISO}T00:00:00Z`)
  const days = Math.round((b - a) / 86_400_000)
  if (days < 0) return 0
  return Math.floor(days / 7) + 1
}

function weekdayName(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' })
}

// {weekday, calWeek, projectWeek, reportNameCompact} shared by the cover,
// every per-equipment production sheet, and the safety sheet's date tables.
export function buildDateTableParams({ date, project }) {
  return {
    weekday: weekdayName(date),
    calWeek: isoCalWeek(date),
    projectWeek: projectWeekNumber(date, project?.start_date),
    reportNameCompact: date.replaceAll('-', ''),
    projectStartDate: project?.start_date ? prettyDate(project.start_date.slice(0, 10)) : null,
  }
}

// Ported from the non-native app's loadProductionSheetData.ts: each
// equipment's "Report #:" is a 6-digit YYMMDD (not the 8-digit
// reportNameCompact above) plus that equipment's initials.
function nameInitials(name) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  if (words.length === 1 && words[0].length >= 2) return words[0].slice(0, 2).toUpperCase()
  return 'XX'
}

// {equipmentId: "YYMMDD" + initials}, looked up per-equipment sheet as
// `../parameters.reportNumberByEquipment`. Native's jfb_equipments has no
// equipment_number column, so unlike reference's Report #, there's no
// separate stored id to fall back to -- this compact form is the only one.
export function buildEquipmentReportNumbers({ date, equipment }) {
  const compact = date.replaceAll('-', '').slice(2)
  const result = {}
  for (const eq of equipment ?? []) {
    result[eq.id] = compact + nameInitials(eq.name)
  }
  return result
}

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

// Reference (ProductionSheetPage.tsx selectActivityDensity) pads the Daily
// Activity grid to a fixed 15 rows only on sparse days (<=12 real rows);
// above that it renders exactly the real row count with no padding, because
// padding on busy days pushed the Delay Summary strip below onto an
// otherwise-empty extra page (reference's own postmortem: Lake Pepin
// 2026-08-03, Torch Lake 2026-08-04). Never truncate real rows.
const ACTIVITY_GRID_ROWS = 15
function padActivityRows(rows) {
  if (rows.length > 12) return rows
  const padded = rows.slice()
  for (let i = padded.length; i < ACTIVITY_GRID_ROWS; i++) {
    padded.push({ num: i + 1, from: '', to: '', minutes: '', area: '', pass: '', event: '', notes: '' })
  }
  return padded
}

// Returns { activitiesByEquipment, delaySummaryByEquipment, opSummaryByEquipment },
// all keyed by equipment_id -- the report template looks up each the same way,
// e.g. `{{#with (lookup ../parameters.dailyActivityByEquipment this.id)}}`.
// `equipmentIds` (all equipment on the project, not just ones with activity
// today) guarantees every sheet gets a padded 15-row grid, including
// equipment with zero logged activity for the day.
export async function buildDailyActivityByEquipmentParam({ appSlug, projectId, dateISO, equipmentIds }) {
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
  for (const id of equipmentIds ?? []) byEquipment.set(id, [])
  for (const a of activities) {
    if (!byEquipment.has(a.equipment_id)) byEquipment.set(a.equipment_id, [])
    byEquipment.get(a.equipment_id).push(a)
  }

  const activitiesByEquipment = {}
  const delaySummaryByEquipment = {}
  const opSummaryByEquipment = {}
  for (const [equipmentId, rows] of byEquipment) {
    const sorted = rows.slice().sort((x, y) => new Date(x.start_date_time) - new Date(y.start_date_time))
    activitiesByEquipment[equipmentId] = padActivityRows(sorted.map((a, i) => ({
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
    })))
    delaySummaryByEquipment[equipmentId] = buildDelaySummary(rows, projectDelayCodeById, masterDelayCodeById)
    opSummaryByEquipment[equipmentId] = summarizeOperatorShift(sorted, operatorNameById)
  }
  return { activitiesByEquipment, delaySummaryByEquipment, opSummaryByEquipment }
}

function fmtHrs(n) {
  return (n ?? 0).toFixed(2)
}
function fmtNum(n) {
  return Math.round(n ?? 0).toLocaleString()
}
function fmtPct(n) {
  return `${Math.round(n)}%`
}

function shapeComboStats(goh, noh, delay, volume, area) {
  return {
    goh: fmtHrs(goh),
    noh: fmtHrs(noh),
    delay: fmtHrs(delay),
    efficiency: fmtPct(goh > 0 ? (noh / goh) * 100 : 0),
    area: fmtNum(area),
    volume: fmtNum(volume),
    cyPerGoh: fmtNum(goh > 0 ? volume / goh : 0),
    cyPerNoh: fmtNum(noh > 0 ? volume / noh : 0),
    sfPerGoh: fmtNum(goh > 0 ? area / goh : 0),
    sfPerNoh: fmtNum(noh > 0 ? area / noh : 0),
  }
}

// Matches the reference app's ProductionSheetPage.tsx exactly: one "Total"
// column (the equipment's whole day) plus one column per work combo (area +
// pass + tsca + attachment) actually logged that day -- NOT a Day/Week/
// Project-Total time-window breakdown (that was this native port's own
// invention and has been replaced to match reference). "Standard" is
// reference's own fallback column label for a day with zero real combos,
// not a real category -- reused here for the same case.
//
// Activities (jfb_daily_activities, via buildCombosFromActivities) are the
// SOLE source of combo identity, mirroring reference's buildCombosFromEvents
// -- jfb_production_stats rows are only ever matched onto an already-built
// combo, never used to originate a new column. A stats row that doesn't
// match any activity combo (e.g. a tsca/pass/area mismatch between logging
// and stats entry) is dropped from the per-combo breakdown, same as
// reference silently drops it, rather than surfacing as its own column with
// no real identity. It still counts toward Total below, matching
// reference's Total (summed straight from every stats row, independent of
// the combo breakdown) -- so entered production is never silently lost from
// the day's total even when it can't be attributed to a specific combo.
export async function buildProductionComboTotalsByEquipmentParam({ appSlug, projectId, reportId, dateISO }) {
  const { gte, lt } = utcDayRange(dateISO)
  const [activityRes, statsRes, areaRes, passTypeRows, attachmentRes] = await Promise.all([
    fetchDomainRecords({
      domain: 'jfb_daily_activities', system: 'core', appSlug,
      filters: { project_id: projectId, start_date_time: { gte, lt } },
      limit: 1000,
    }),
    fetchDomainRecords({ domain: 'jfb_production_stats', system: 'core', appSlug, filters: { report_id: reportId }, limit: 500 }),
    fetchDomainRecords({ domain: 'jfb_project_areas', system: 'core', appSlug, filters: { project_id: projectId }, limit: 1000 }),
    fetchPicklistValues('pkl-jfb-pass-type'),
    fetchDomainRecords({ domain: 'jfb_project_attachments', system: 'core', appSlug, filters: { project_id: projectId }, limit: 200 }),
  ])

  const areaNameById = new Map((areaRes?.data ?? []).map((a) => [a.id, a.name]))
  const passLabels = Object.fromEntries(
    (passTypeRows || []).filter((r) => r.is_active !== false).map((r) => [r.value, r.label ?? r.value]),
  )
  const attachmentNameById = new Map((attachmentRes?.data ?? []).map((a) => [a.id, a.name]))

  function comboLabel(c) {
    if (isUnassigned(c)) return 'Standard'
    const parts = []
    if (c.attachmentId && attachmentNameById.has(c.attachmentId)) parts.push(attachmentNameById.get(c.attachmentId))
    if (c.passKey) parts.push(passLabels[c.passKey] ?? c.passKey)
    return parts.length ? parts.join(' | ') : 'Standard'
  }
  // Natural-key match only (area + pass + tsca) -- deliberately excludes
  // attachment, mirroring reference's statsForCombo(). Production stats
  // don't reliably carry the same attachment a PE logged on the activity
  // side, so matching on it would drop real volume/area for no reason.
  function statsMatchCombo(s, c) {
    const areaId = s.area_level_combinations?.[0]?.area_id ?? null
    // Same tsca bucketing as comboKey() (productionCombos.js): null and
    // false are the same "not flagged" bucket, only true is distinct. Must
    // match here too, or a stats row with tsca=false silently stops
    // matching a combo whose activities left tsca unset (null).
    const statsTscaBucket = s.tsca === true ? 'y' : 'n'
    const comboTscaBucket = c.tsca === true ? 'y' : 'n'
    return areaId === c.areaId
      && (s.pass_value ?? null) === c.passKey
      && statsTscaBucket === comboTscaBucket
  }

  const activities = (activityRes?.data ?? []).filter((a) => sameCalendarDay(a.start_date_time, dateISO, a.timezone))
  const statsRows = statsRes?.data ?? []

  const byEquipment = new Map()
  for (const a of activities) {
    if (!byEquipment.has(a.equipment_id)) byEquipment.set(a.equipment_id, { activities: [], stats: [] })
    byEquipment.get(a.equipment_id).activities.push(a)
  }
  for (const s of statsRows) {
    if (!s.equipment_id) continue
    if (!byEquipment.has(s.equipment_id)) byEquipment.set(s.equipment_id, { activities: [], stats: [] })
    byEquipment.get(s.equipment_id).stats.push(s)
  }

  const result = {}
  for (const [equipmentId, { activities: acts, stats: eqStats }] of byEquipment) {
    const actCombos = buildCombosFromActivities(acts, { passKeyOf: (a) => a.pass_type })

    const rawCombos = actCombos.map((c) => {
      const goh = c.timeHours ?? 0
      const noh = comboNOH(c)
      const matched = eqStats.filter((s) => statsMatchCombo(s, c))
      const volume = matched.reduce((a, s) => a + (Number(s.volume) || 0), 0)
      const area = matched.reduce((a, s) => a + (Number(s.area) || 0), 0)
      return { c, goh, noh, delay: Math.max(0, goh - noh), volume, area }
    })

    const totalGoh = rawCombos.reduce((a, r) => a + r.goh, 0)
    const totalNoh = rawCombos.reduce((a, r) => a + r.noh, 0)
    const totalDelay = rawCombos.reduce((a, r) => a + r.delay, 0)
    // Total volume/area sums every stats row for this equipment/report,
    // independent of the combo breakdown -- matches reference's Total (which
    // never derives from the per-combo columns), so a stats row that can't
    // be attributed to any activity combo still counts toward the day's
    // total instead of vanishing.
    const totalVolume = eqStats.reduce((a, s) => a + (Number(s.volume) || 0), 0)
    const totalArea = eqStats.reduce((a, s) => a + (Number(s.area) || 0), 0)
    const totalAreaLabel = [...new Set(rawCombos.map((r) => areaNameById.get(r.c.areaId)).filter(Boolean))].join(', ') || '—'

    const combos = rawCombos.length > 0
      ? rawCombos.map((r) => ({
          columnLabel: comboLabel(r.c),
          areaLabel: r.c.areaId ? (areaNameById.get(r.c.areaId) ?? '—') : '—',
          ...shapeComboStats(r.goh, r.noh, r.delay, r.volume, r.area),
        }))
      : [{ columnLabel: 'Standard', areaLabel: '—', ...shapeComboStats(0, 0, 0, 0, 0) }]
    const total = { areaLabel: totalAreaLabel, ...shapeComboStats(totalGoh, totalNoh, totalDelay, totalVolume, totalArea) }

    // Row-oriented on purpose: this Handlebars engine has no way to look up
    // "column N of this row" by index, so each metric becomes one row with
    // a `values` array already in the same order as `columns` -- the
    // template just walks {{#each rows}}...{{#each this.values}} in lockstep
    // with the header's {{#each columns}}.
    const METRIC_ROWS = [
      ['Gross Operating Hours (GOH)', 'goh'],
      ['Net Operating Hours (NOH)', 'noh'],
      ['Delay Hours', 'delay'],
      ['Efficiency', 'efficiency'],
      ['Area (SF)', 'area'],
      ['Volume (CY)', 'volume'],
      ['CY/GOH', 'cyPerGoh'],
      ['CY/NOH', 'cyPerNoh'],
      ['SF/GOH', 'sfPerGoh'],
      ['SF/NOH', 'sfPerNoh'],
      ['Area', 'areaLabel'],
    ]
    result[equipmentId] = {
      columns: combos.map((c) => c.columnLabel),
      rows: METRIC_ROWS.map(([label, key]) => ({
        label,
        total: total[key],
        values: combos.map((c) => c[key]),
      })),
      // Whole-day headline figures for the sheet's big Operating/Delay/Total
      // Hours stat boxes -- those need one named value each, not a row walk.
      headline: { goh: total.goh, noh: total.noh, delay: total.delay },
    }
  }
  return result
}

// Ported from the non-native app's src/lib/dates.ts weekStartISO -- Sunday
// of the week containing dateISO. Deliberately NOT mondayStartISO: reference
// uses a different week boundary for this cover table than it does for the
// Weekly Summary report (which runs Monday-Sunday production weeks), so this
// stays local rather than becoming a third caller of mondayStartISO.
function sundayStartISO(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - dt.getDay())
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function fmtCoverHrs(n) {
  return n == null ? null : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtCoverPct(n) {
  return n == null ? null : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtCoverCy(n) {
  return n == null ? null : n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
function fmtCoverSf(n) {
  return n == null ? null : Math.round(n).toLocaleString('en-US')
}

// Matches the non-native app's cover-page "Project Production Table"
// exactly: 5 fixed metric rows (Total Volume Removed / Total Area Covered /
// Operating Hours / Delay Hours / Efficiency), each with Day/Week/Project
// Total columns -- replaces this native port's own earlier invention (a raw
// per-production-stats-row list plus one "Total (All Passes)" line).
//
// Sourced from dvw-jfb-realized-daily-totals (the same per-day cy/sf/goh/noh
// view Weekly Summary and Realized To-Date already use), fetched once for
// the whole project history and reduced client-side into Day/Week/Project
// windows -- Week is Sunday-of-this-week through today (sundayStartISO,
// reference's own boundary for THIS table), Project is every day up to and
// including today. Per an explicit product decision, this reuses that view
// as-is (released reports only) rather than reference's own unrestricted
// (draft+approved+released) historical rollup, for consistency with how
// Weekly Summary/Realized To-Date already scope their own history -- an
// approved-but-not-yet-released day's own numbers won't show until release.
//
// Operating Hours (noh) and Delay Hours (goh-noh) come from
// jfb_daily_activities via the view's own goh/noh convention (every activity
// counts toward GOH; only activities with no delay_code_id count toward
// NOH), which is functionally the reference app's own "shift span minus
// delay" definition whenever a shift has no unlogged gaps. Efficiency is a
// ratio of SUMMED goh/noh over each window, not an average of daily
// efficiencies, matching reference's own rollup formula.
export async function buildCoverProductionTotalsParam({ projectId, project, dateISO }) {
  const projectStart = project?.production_start_date || (project?.start_date ? project.start_date.slice(0, 10) : '2000-01-01')
  const weekStart = sundayStartISO(dateISO)

  const rows = await executeDataView('dvw-jfb-realized-daily-totals', { p_project_id: projectId, p_start_date: projectStart })
  const days = (rows ?? []).map((r) => ({
    date: r.report_date,
    cy: Number(r.cy) || 0,
    sf: Number(r.sf) || 0,
    goh: Number(r.goh) || 0,
    noh: Number(r.noh) || 0,
  }))

  function windowStats(matching) {
    const cy = matching.reduce((a, d) => a + d.cy, 0)
    const sf = matching.reduce((a, d) => a + d.sf, 0)
    const goh = matching.reduce((a, d) => a + d.goh, 0)
    const noh = matching.reduce((a, d) => a + d.noh, 0)
    return {
      volume: fmtCoverCy(cy),
      area: fmtCoverSf(sf),
      operating: fmtCoverHrs(noh),
      delay: fmtCoverHrs(Math.max(0, goh - noh)),
      efficiency: fmtCoverPct(goh > 0 ? (noh / goh) * 100 : 0),
    }
  }

  const dayRow = days.find((d) => d.date === dateISO) ?? null
  // No activities logged today (or the day isn't released yet) -- reference
  // shows an em-dash for the time-based metrics rather than a misleading
  // "0.00 hrs", since a shift that was never logged isn't the same as one
  // that logged zero productive hours.
  const dayHasActivity = !!dayRow && (dayRow.goh !== 0 || dayRow.noh !== 0)
  const dayEfficiencyPct = dayHasActivity && dayRow.goh > 0 ? (dayRow.noh / dayRow.goh) * 100 : 0
  const day = dayRow
    ? {
        volume: fmtCoverCy(dayRow.cy),
        area: fmtCoverSf(dayRow.sf),
        operating: dayHasActivity ? fmtCoverHrs(dayRow.noh) : null,
        delay: dayHasActivity ? fmtCoverHrs(Math.max(0, dayRow.goh - dayRow.noh)) : null,
        efficiency: dayHasActivity ? fmtCoverPct(dayEfficiencyPct) : null,
      }
    : { volume: null, area: null, operating: null, delay: null, efficiency: null }

  const week = windowStats(days.filter((d) => d.date >= weekStart && d.date <= dateISO))
  const projectTotal = windowStats(days.filter((d) => d.date <= dateISO))

  const METRIC_ROWS = [
    ['Total Volume Removed', 'volume', 'CY'],
    ['Total Area Covered', 'area', 'SF'],
    ['Operating Hours', 'operating', 'hrs'],
    ['Delay Hours', 'delay', 'hrs'],
    ['Efficiency', 'efficiency', '%'],
  ]
  return {
    rows: METRIC_ROWS.map(([label, key, unit]) => ({
      label,
      unit,
      day: day[key],
      week: week[key],
      project: projectTotal[key],
    })),
  }
}

function dateOnlyPdf(iso) {
  return iso ? String(iso).slice(0, 10) : null
}
function fmtFlow1(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
function fmtFlow0(n) {
  return Math.round(n).toLocaleString('en-US')
}

// Matches the reference app's buildFlowStats()/PipeLengthsBody exactly.
// Flow Stats is per-equipment (jfb_hydraulic_flow_stats has its own
// equipment_id): Previous Total Flow is every one of this equipment's
// daily_total_gal entries through yesterday, Project Total is through
// today -- both always show a real number even if today has no new
// reading, as long as SOME history exists (matches reference's own
// "return null only when there's neither today's values nor any history"
// rule, rather than hiding totals just because today wasn't logged yet).
// Pipe Lengths is project-wide (jfb_hydraulic_pipe_configurations has no
// equipment_id column), so every equipment's sheet gets the same segment
// list for the day, same as reference's own project-wide pipeRows.
export async function buildFlowAndPipeByEquipmentParam({ appSlug, projectId, dateISO }) {
  const [flowRes, pipeRes] = await Promise.all([
    fetchDomainRecords({ domain: 'jfb_hydraulic_flow_stats', system: 'core', appSlug, filters: { project_id: projectId }, limit: 5000 }),
    fetchDomainRecords({ domain: 'jfb_hydraulic_pipe_configurations', system: 'core', appSlug, filters: { project_id: projectId }, limit: 500 }),
  ])
  const flowRows = flowRes?.data ?? []
  const pipeRows = pipeRes?.data ?? []

  const byEquipment = new Map()
  for (const r of flowRows) {
    if (!byEquipment.has(r.equipment_id)) byEquipment.set(r.equipment_id, [])
    byEquipment.get(r.equipment_id).push(r)
  }

  const flowStatsByEquipment = {}
  for (const [equipmentId, rows] of byEquipment) {
    const todaysRow = rows.find((r) => dateOnlyPdf(r.log_date) === dateISO) ?? null
    const hasHistory = rows.some((r) => dateOnlyPdf(r.log_date) < dateISO)
    const hasTodayValue = !!todaysRow && (todaysRow.avg_line_velocity != null || todaysRow.avg_flow_rate != null || todaysRow.daily_total_gal != null)
    if (!hasTodayValue && !hasHistory) continue

    const projectTotalGal = rows
      .filter((r) => dateOnlyPdf(r.log_date) <= dateISO)
      .reduce((a, r) => a + (Number(r.daily_total_gal) || 0), 0)
    const dailyTotalGal = Number(todaysRow?.daily_total_gal) || 0

    flowStatsByEquipment[equipmentId] = {
      avgVelocityFps: todaysRow?.avg_line_velocity != null ? fmtFlow1(Number(todaysRow.avg_line_velocity)) : null,
      avgFlowRateGpm: todaysRow?.avg_flow_rate != null ? fmtFlow0(Number(todaysRow.avg_flow_rate)) : null,
      dailyTotalGal: todaysRow?.daily_total_gal != null ? fmtFlow0(dailyTotalGal) : null,
      previousTotalGal: fmtFlow0(Math.max(0, projectTotalGal - dailyTotalGal)),
      projectTotalGal: fmtFlow0(projectTotalGal),
    }
  }

  const todaysPipeRows = pipeRows.filter((r) => dateOnlyPdf(r.log_date) === dateISO)
  const pipeSegments = todaysPipeRows.map((r) => ({ id: r.id, name: r.segment_name, lengthFt: fmtFlow0(Number(r.length_ft) || 0) }))
  const pipeTotalLength = fmtFlow0(todaysPipeRows.reduce((a, r) => a + (Number(r.length_ft) || 0), 0))

  return { flowStatsByEquipment, pipeSegments, pipeTotalLength }
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
