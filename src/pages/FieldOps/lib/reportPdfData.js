import { fetchDomainRecords, fetchPicklistValues, downloadAttachment, executeDataView } from '../../../data'
import { renderWeeklyProgressCharts } from '../../../lib/dredge/weeklyChart'

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

export async function buildDailyActivityByEquipmentParam({ appSlug, projectId, dateISO }) {
  const { gte, lt } = utcDayRange(dateISO)

  const [activityRes, areaLabelRows, projectDelayRes, masterDelayRes, passTypeRows] = await Promise.all([
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
  ])

  const areaLabelByActivityId = new Map(
    (areaLabelRows ?? []).map((r) => [r.activity_id, [r.area_l1, r.area_l2, r.area_l3].filter(Boolean).join(' / ') || '—']),
  )
  const projectDelayCodeById = new Map((projectDelayRes?.data ?? []).map((r) => [r.id, r]))
  const masterDelayCodeById = new Map((masterDelayRes?.data ?? []).map((r) => [r.id, r]))
  const passTypeLabels = Object.fromEntries(
    (passTypeRows || []).filter((r) => r.is_active !== false).map((r) => [r.value, r.label ?? r.value]),
  )

  const activities = (activityRes?.data ?? []).filter((a) => sameCalendarDay(a.start_date_time, dateISO, a.timezone))

  const byEquipment = new Map()
  for (const a of activities) {
    if (!byEquipment.has(a.equipment_id)) byEquipment.set(a.equipment_id, [])
    byEquipment.get(a.equipment_id).push(a)
  }

  const result = {}
  for (const [equipmentId, rows] of byEquipment) {
    const sorted = rows.slice().sort((x, y) => new Date(x.start_date_time) - new Date(y.start_date_time))
    result[equipmentId] = sorted.map((a, i) => ({
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
  }
  return result
}
