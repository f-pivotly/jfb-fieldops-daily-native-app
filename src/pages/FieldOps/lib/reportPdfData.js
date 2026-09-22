import { fetchDomainRecords, fetchPicklistValues, downloadAttachment, executeDataView, fetchPublicAsset } from '../../../data'
import { renderWeeklyProgressCharts } from '../../../lib/dredge/weeklyChart'
import { buildCombosFromActivities, comboNOH, isUnassigned } from '../../../lib/productionCombos'
import { equipmentWorkType, isProductiveActivity } from './workType'
import { prettyDate, blobToDataUri, fmtNum, fmtHrs } from './realizedToDate'
import { UNATTRIBUTED_CATEGORY, shiftTotals } from './eventTotals'
import { metricValueKey } from '../../../lib/metricValueKey'
import { isDirectImageUrl } from '../../../lib/imageSource'
import { hhmm, utcDayRange } from '../../../lib/reportDates'
import { airWindowUtc, buildAirDay } from '../../../lib/airQuality/data'
import { buildAirChartSpecs, renderAirChart } from '../../../lib/airQuality/chart'
import { reportWindowUtc, buildTurbidityDay } from '../../../lib/waterQuality/data'
import { renderTurbidityChart } from '../../../lib/waterQuality/chart'

function isCappingEquipment(project, equipment, dateISO) {
  return equipmentWorkType(project, equipment, dateISO).toLowerCase().includes('cap')
}

export function isoCalWeek(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dayNum = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1)
  return Math.ceil(((dt.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

export function projectWeekNumber(reportDateISO, projectStartRaw) {
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

export function buildDateTableParams({ date, project }) {
  return {
    weekday: weekdayName(date),
    calWeek: isoCalWeek(date),
    projectWeek: projectWeekNumber(date, project?.start_date),
    reportNameCompact: date.replaceAll('-', ''),
    projectStartDate: project?.start_date ? prettyDate(project.start_date.slice(0, 10)) : null,
  }
}

function nameInitials(name) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  if (words.length === 1 && words[0].length >= 2) return words[0].slice(0, 2).toUpperCase()
  return 'XX'
}

export function buildEquipmentReportNumbers({ date, equipment }) {
  const compact = date.replaceAll('-', '').slice(2)
  const result = {}
  for (const eq of equipment ?? []) {
    result[eq.id] = compact + nameInitials(eq.name)
  }
  return result
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

export async function buildDredgeChartAssetsParam({ appSlug, reportId, project, equipment, dateISO }) {
  const [progressRes, placementRes, spreaderRes] = await Promise.all([
    fetchDomainRecords({
      domain: 'jfb_dredge_progress', system: 'core', appSlug,
      filters: { report_id: reportId }, limit: 50,
    }),
    fetchDomainRecords({
      domain: 'jfb_placement_progress', system: 'core', appSlug,
      filters: { report_id: reportId }, limit: 50,
    }).catch(() => null),
    fetchDomainRecords({
      domain: 'jfb_spreader_progress', system: 'core', appSlug,
      filters: { report_id: reportId }, limit: 50,
    }).catch(() => null),
  ])
  const chartByEquipmentId = new Map(
    (progressRes?.data ?? []).filter((r) => r.chart_path).map((r) => [String(r.equipment_id), r.chart_path]),
  )
  const placementChartByEquipmentId = new Map(
    (placementRes?.data ?? []).filter((r) => r.chart_path).map((r) => [String(r.equipment_id), r.chart_path]),
  )
  const spreaderChartByEquipmentId = new Map(
    (spreaderRes?.data ?? []).filter((r) => r.chart_path).map((r) => [String(r.equipment_id), r.chart_path]),
  )

  const entries = await Promise.all(
    (equipment ?? [])
      .map((eq) => {
        const capping = isCappingEquipment(project, eq, dateISO)
        const chartPath = capping
          ? placementChartByEquipmentId.get(String(eq.id)) ??
            spreaderChartByEquipmentId.get(String(eq.id)) ??
            null
          : chartByEquipmentId.get(String(eq.id)) ?? null
        return { eq, include: !capping || !!chartPath, chartPath }
      })
      .filter((c) => c.include)
      .map(async ({ eq, chartPath }) => {
        const dataUri = chartPath ? await blobToDataUri(await downloadAttachment(chartPath)) : null
        return [String(eq.id), {
          dataUri,
          equipmentName: eq.name,
          projectName: project?.name ?? '',
          dateISO,
        }]
      }),
  )
  return Object.fromEntries(entries)
}

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
  const contentByKey = new Map((contentRes?.data ?? []).map((c) => [c.section_key, c.content]))

  return sections.map((s) => ({
    label: s.narrative_label,
    content: (contentByKey.get(s.section_key) ?? '').trim(),
  }))
}

function durationMinutes(startISO, endISO) {
  if (!startISO || !endISO) return null
  const ms = new Date(endISO) - new Date(startISO)
  if (ms <= 0) return null
  return Math.round(ms / 60000)
}

function resolveDelayCode(delayCodeId, projectDelayCodeById, masterDelayCodeById) {
  if (!delayCodeId) return '—'
  const row = projectDelayCodeById.get(delayCodeId)
  if (!row) return '—'
  const master = row.delay_code_id ? masterDelayCodeById.get(row.delay_code_id) : null
  return (master ? master.code : row.code) || '—'
}

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

const ACTIVITY_GRID_ROWS = { dredge: { max: 12, target: 15 }, capping: { max: 10, target: 12 } }
function padActivityRows(rows, grid) {
  if (rows.length > grid.max) return rows
  const padded = rows.slice()
  for (let i = padded.length; i < grid.target; i++) {
    padded.push({ num: i + 1, from: '', to: '', minutes: '', area: '', pass: '', event: '', notes: '' })
  }
  return padded
}

export async function buildDailyActivityByEquipmentParam({ appSlug, projectId, project, dateISO, equipment }) {
  const { gte, lt } = utcDayRange(dateISO)

  const [activityRes, areaLabelRows, projectDelayRes, masterDelayRes, passTypeRows, operatorRes] = await Promise.all([
    fetchDomainRecords({
      domain: 'jfb_daily_activities', system: 'core', appSlug,
      filters: { project_id: projectId, report_date: dateISO },
      limit: 1000,
    }),
    executeDataView('dvw-jfb-activity-area-labels-v2', {
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

  const activities = (activityRes?.data ?? [])

  const cappingEquipmentIds = new Set(
    (equipment ?? []).filter((eq) => isCappingEquipment(project, eq, dateISO)).map((eq) => eq.id),
  )

  const byEquipment = new Map()
  for (const eq of equipment ?? []) byEquipment.set(eq.id, [])
  for (const a of activities) {
    if (!byEquipment.has(a.equipment_id)) byEquipment.set(a.equipment_id, [])
    byEquipment.get(a.equipment_id).push(a)
  }

  const activitiesByEquipment = {}
  const delaySummaryByEquipment = {}
  const opSummaryByEquipment = {}
  for (const [equipmentId, rows] of byEquipment) {
    const isCapping = cappingEquipmentIds.has(equipmentId)
    const sorted = rows.slice().sort((x, y) => new Date(x.start_date_time) - new Date(y.start_date_time))
    const listed = isCapping ? sorted.filter((a) => !isProductiveActivity(a)) : sorted
    activitiesByEquipment[equipmentId] = padActivityRows(listed.map((a, i) => ({
      num: i + 1,
      from: hhmm(a.start_date_time),
      to: hhmm(a.end_date_time),
      minutes: durationMinutes(a.start_date_time, a.end_date_time) ?? '—',
      area: areaLabelByActivityId.get(a.id) ?? '—',
      pass: a.pass_type ? (passTypeLabels[a.pass_type] ?? a.pass_type) : '—',
      event: a.category || resolveDelayCode(a.delay_code_id, projectDelayCodeById, masterDelayCodeById),
      notes: a.notes || '',
    })), isCapping ? ACTIVITY_GRID_ROWS.capping : ACTIVITY_GRID_ROWS.dredge)
    delaySummaryByEquipment[equipmentId] = buildDelaySummary(rows, projectDelayCodeById, masterDelayCodeById)
    opSummaryByEquipment[equipmentId] = summarizeOperatorShift(sorted, operatorNameById)
  }
  return { activitiesByEquipment, delaySummaryByEquipment, opSummaryByEquipment }
}

function fmtPct(n) {
  return `${Math.round(n)}%`
}

function fmtDec(n, digits) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function ratio(numerator, denominator) {
  if (!denominator || !Number.isFinite(denominator)) return 0
  return numerator / denominator
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

const SF_PER_ACRE = 43560

const CAP_METRIC_ROWS = [
  ['Gross Operating Hours (GOH)', 'goh'],
  ['Net Operating Hours (NOH)', 'noh'],
  ['Efficiency', 'efficiency'],
  ['Tons/GOH', 'tonsPerGoh'],
  ['Tons/NOH', 'tonsPerNoh'],
  ['Area (SF)', 'areaSf'],
  ['Acres', 'acres'],
  ['Design Tons', 'designTons'],
  ['Tons Placed', 'tonsPlaced'],
  ['CY Placed', 'cyPlaced'],
  ['Estimated Inches', 'estInches'],
  ['Material Placed', 'material'],
  ['Pass', 'passText'],
  ['Area', 'areaLabel'],
]

const CAP_CY_DERIVED_ROWS = new Set(['cyPlaced', 'estInches', 'designTons'])

function areaKeyOfCombo(c) {
  return [c.areaId ?? '', c.subAreaId ?? '', c.subSubAreaId ?? ''].join('|')
}
function areaKeyOfStat(s) {
  const combo = Array.isArray(s.area_level_combinations) ? s.area_level_combinations : []
  return [combo[0]?.area_id ?? '', combo[1]?.area_id ?? '', combo[2]?.area_id ?? ''].join('|')
}
function hasCapProduction(s) {
  return s.tons != null || s.volume != null || s.area != null
}

function designCyPerSf(areaId, areaById) {
  const area = areaId ? areaById.get(areaId) : null
  const cy = area?.volume_goal_cy ?? null
  const sf = area?.area_goal_sf ?? null
  if (cy == null || sf == null || Number(sf) === 0) return 0
  return Number(cy) / Number(sf)
}

function joinUnique(values) {
  const set = new Set()
  for (const v of values) {
    const t = typeof v === 'string' ? v.trim() : v
    if (t) set.add(String(t))
  }
  return set.size === 0 ? '—' : [...set].join(', ')
}

function shapeCapStats(raw) {
  const acres = raw.areaSf > 0 ? raw.areaSf / SF_PER_ACRE : 0
  const estInches = raw.areaSf > 0 ? (raw.cyPlaced * 324) / raw.areaSf : 0
  return {
    goh: fmtHrs(raw.goh),
    noh: fmtHrs(raw.noh),
    efficiency: fmtPct(raw.goh > 0 ? (raw.noh / raw.goh) * 100 : 0),
    tonsPerGoh: fmtDec(ratio(raw.tonsPlaced, raw.goh), 1),
    tonsPerNoh: fmtDec(ratio(raw.tonsPlaced, raw.noh), 1),
    areaSf: fmtDec(raw.areaSf, 0),
    acres: fmtDec(acres, 1),
    designTons: fmtDec(raw.designTons, 1),
    tonsPlaced: fmtDec(raw.tonsPlaced, 1),
    cyPlaced: fmtDec(raw.cyPlaced, 1),
    estInches: fmtDec(estInches, 2),
    material: raw.material || '—',
    passText: raw.passText || '—',
    areaLabel: raw.areaLabel || '—',
  }
}

function buildCappingColumns({ acts, eqStats, project, labels }) {
  const { areaById, areaNameById, layerById, materialNameById, passLabels } = labels

  const combos = buildCombosFromActivities(acts, { passKeyOf: (a) => a.layer_id })
  const groups = new Map()
  for (const c of combos) {
    const key = areaKeyOfCombo(c)
    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        areaL1Id: c.areaId ?? null,
        areaText: [c.areaId, c.subAreaId, c.subSubAreaId]
          .filter(Boolean)
          .map((id) => areaNameById.get(id) ?? '—')
          .join(' / '),
        unassigned: isUnassigned(c) || (!c.areaId && !c.subAreaId && !c.subSubAreaId),
        goh: 0,
        noh: 0,
      }
      groups.set(key, g)
    }
    g.goh += c.timeHours
    g.noh += comboNOH(c)
  }

  const layerRank = (layerId) => layerById.get(layerId)?.sort_order ?? Number.MAX_SAFE_INTEGER
  const detailOf = (st) => {
    if (!st) return ''
    const pass = st.pass_value ? (passLabels[st.pass_value] ?? st.pass_value) : ''
    return pass || layerById.get(st.layer_id)?.layer_name || ''
  }

  function mkColumn(key, g, st, goh, noh) {
    const areaSf = Number(st?.area) || 0
    const tonsPlaced = Number(st?.tons) || 0
    const cyPlaced = Number(st?.volume) || 0
    const factor = st?.conversion_factor ?? project?.cap_conversion_factor ?? null
    const designTons = factor ? areaSf * designCyPerSf(g.areaL1Id, areaById) * Number(factor) : 0
    const areaText = g.unassigned ? 'Unassigned' : (g.areaText || '—')
    const detail = detailOf(st)
    return {
      key,
      columnLabel: detail ? `${areaText} | ${detail}` : areaText,
      layerId: st?.layer_id ?? null,
      layerRank: layerRank(st?.layer_id),
      areaText,
      raw: {
        goh,
        noh,
        areaSf,
        tonsPlaced,
        cyPlaced,
        designTons,
        material: materialNameById.get(st?.material_id) ?? '—',
        passText: st?.pass_value ? (passLabels[st.pass_value] ?? st.pass_value) : '—',
        areaLabel: areaText,
      },
    }
  }

  const produced = eqStats.filter(hasCapProduction)
  const statsByArea = new Map()
  for (const s of produced) {
    const key = areaKeyOfStat(s)
    const list = statsByArea.get(key)
    if (list) list.push(s)
    else statsByArea.set(key, [s])
  }

  const hoursByAreaLayer = new Map()
  let anyEventLayer = false
  for (const c of combos) {
    if (!c.passKey) continue
    anyEventLayer = true
    const k = `${areaKeyOfCombo(c)}||${c.passKey}`
    const cur = hoursByAreaLayer.get(k) ?? { goh: 0, noh: 0 }
    cur.goh += c.timeHours
    cur.noh += comboNOH(c)
    hoursByAreaLayer.set(k, cur)
  }

  const columns = []
  for (const [key, g] of groups) {
    const areaStats = statsByArea.get(key) ?? []
    if (g.unassigned && areaStats.length === 0 && g.goh <= 0.001) continue
    const rowsForArea = areaStats.length > 0 ? areaStats : [null]

    const measured = anyEventLayer && areaStats.length > 0
      ? areaStats.map((st) => (st.layer_id ? hoursByAreaLayer.get(`${key}||${st.layer_id}`) ?? null : null))
      : null
    const useMeasured = measured !== null && measured.every((h) => h !== null)

    const totalTons = rowsForArea.reduce((a, s) => a + (Number(s?.tons) || 0), 0)
    rowsForArea.forEach((st, i) => {
      const share = rowsForArea.length <= 1
        ? 1
        : (totalTons > 0 ? (Number(st?.tons) || 0) / totalTons : 1 / rowsForArea.length)
      const goh = useMeasured ? measured[i].goh : g.goh * share
      const noh = useMeasured ? measured[i].noh : g.noh * share
      columns.push(mkColumn(st ? `${key}##${st.id}` : key, g, st, goh, noh))
    })
  }

  columns.sort(
    (a, b) =>
      a.areaText.localeCompare(b.areaText) || a.layerRank - b.layerRank || a.columnLabel.localeCompare(b.columnLabel),
  )

  const totalGoh = [...groups.values()].reduce((a, g) => a + g.goh, 0)
  const totalNoh = [...groups.values()].reduce((a, g) => a + g.noh, 0)
  const total = {
    goh: totalGoh,
    noh: totalNoh,
    areaSf: produced.reduce((a, s) => a + (Number(s.area) || 0), 0),
    tonsPlaced: produced.reduce((a, s) => a + (Number(s.tons) || 0), 0),
    cyPlaced: produced.reduce((a, s) => a + (Number(s.volume) || 0), 0),
    designTons: columns.reduce((a, c) => a + c.raw.designTons, 0),
    material: joinUnique(produced.map((s) => materialNameById.get(s.material_id))),
    passText: joinUnique(produced.map((s) => (s.pass_value ? (passLabels[s.pass_value] ?? s.pass_value) : null))),
    areaLabel: joinUnique(columns.map((c) => c.areaText)),
  }

  return { columns, total }
}

function shapeCappingSheet({ acts, eqStats, project, labels }) {
  const { columns, total } = buildCappingColumns({ acts, eqStats, project, labels })
  const derivesCy =
    project?.cap_conversion_factor != null || columns.some((c) => c.raw.cyPlaced !== 0)
  const metricRows = derivesCy
    ? CAP_METRIC_ROWS
    : CAP_METRIC_ROWS.filter(([, key]) => !CAP_CY_DERIVED_ROWS.has(key))

  const shaped = columns.length > 0
    ? columns.map((c) => ({ columnLabel: c.columnLabel, ...shapeCapStats(c.raw) }))
    : [{
        columnLabel: 'Standard',
        ...shapeCapStats({ goh: 0, noh: 0, areaSf: 0, tonsPlaced: 0, cyPlaced: 0, designTons: 0, material: '—', passText: '—', areaLabel: '—' }),
      }]
  const shapedTotal = shapeCapStats(total)

  return {
    columns: shaped.map((c) => c.columnLabel),
    rows: metricRows.map(([label, key]) => ({
      label,
      total: shapedTotal[key],
      values: shaped.map((c) => c[key]),
    })),
    headline: {
      goh: fmtHrs(total.goh),
      noh: fmtHrs(total.noh),
      delay: fmtHrs(Math.max(0, total.goh - total.noh)),
    },
  }
}

export async function buildProductionComboTotalsByEquipmentParam({ appSlug, projectId, project, reportId, dateISO, equipment }) {
  const [activityRes, statsRes, areaRes, passTypeRows, attachmentRes, layerRes, materialRes] = await Promise.all([
    fetchDomainRecords({
      domain: 'jfb_daily_activities', system: 'core', appSlug,
      filters: { project_id: projectId, report_date: dateISO },
      limit: 1000,
    }),
    fetchDomainRecords({ domain: 'jfb_production_stats', system: 'core', appSlug, filters: { report_id: reportId }, limit: 500 }),
    fetchDomainRecords({ domain: 'jfb_project_areas', system: 'core', appSlug, filters: { project_id: projectId }, limit: 1000 }),
    fetchPicklistValues('pkl-jfb-pass-type'),
    fetchDomainRecords({ domain: 'jfb_project_attachments', system: 'core', appSlug, filters: { project_id: projectId }, limit: 200 }),
    fetchDomainRecords({ domain: 'jfb_project_layers', system: 'core', appSlug, filters: { project_id: projectId }, limit: 200 }),
    fetchDomainRecords({ domain: 'jfb_project_materials', system: 'core', appSlug, filters: { project_id: projectId }, limit: 200 }),
  ])

  const areaNameById = new Map((areaRes?.data ?? []).map((a) => [a.id, a.name]))
  const passLabels = Object.fromEntries(
    (passTypeRows || []).filter((r) => r.is_active !== false).map((r) => [r.value, r.label ?? r.value]),
  )
  const attachmentNameById = new Map((attachmentRes?.data ?? []).map((a) => [a.id, a.name]))
  const cappingLabels = {
    areaById: new Map((areaRes?.data ?? []).map((a) => [a.id, a])),
    areaNameById,
    passLabels,
    layerById: new Map(
      (layerRes?.data ?? []).map((l) => [l.id, { ...l, layer_name: l.layer_report_name || l.layer_name }]),
    ),
    materialNameById: new Map(
      (materialRes?.data ?? []).map((m) => [m.id, m.material_report_name || m.material_name]),
    ),
  }
  const cappingEquipmentIds = new Set(
    (equipment ?? []).filter((eq) => isCappingEquipment(project, eq, dateISO)).map((eq) => eq.id),
  )

  function comboLabel(c) {
    if (isUnassigned(c)) return 'Standard'
    const parts = []
    if (c.attachmentId && attachmentNameById.has(c.attachmentId)) parts.push(attachmentNameById.get(c.attachmentId))
    if (c.passKey) parts.push(passLabels[c.passKey] ?? c.passKey)
    return parts.length ? parts.join(' | ') : 'Standard'
  }
  function statsMatchCombo(s, c) {
    const areaId = s.area_level_combinations?.[0]?.area_id ?? null
    const statsTscaBucket = s.tsca === true ? 'y' : 'n'
    const comboTscaBucket = c.tsca === true ? 'y' : 'n'
    return areaId === c.areaId
      && (s.pass_value ?? null) === c.passKey
      && statsTscaBucket === comboTscaBucket
  }

  const activities = (activityRes?.data ?? [])
  const statsRows = statsRes?.data ?? []

  const byEquipment = new Map()
  for (const eq of equipment ?? []) byEquipment.set(eq.id, { activities: [], stats: [] })
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
    if (cappingEquipmentIds.has(equipmentId)) {
      result[equipmentId] = shapeCappingSheet({ acts, eqStats, project, labels: cappingLabels })
      continue
    }
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
      headline: { goh: total.goh, noh: total.noh, delay: total.delay },
    }
  }
  return result
}

function sundayStartISO(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - dt.getDay())
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function fmtCover2dp(n) {
  return n == null ? null : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtCoverHrs = fmtCover2dp
const fmtCoverPct = fmtCover2dp
function fmtCoverCy(n) {
  return n == null ? null : n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
function fmtCoverSf(n) {
  return n == null ? null : Math.round(n).toLocaleString('en-US')
}

export async function buildCoverProductionTotalsParam({ projectId, project, dateISO }) {
  const projectStart = project?.production_start_date || (project?.start_date ? project.start_date.slice(0, 10) : '2000-01-01')
  const weekStart = sundayStartISO(dateISO)

  const rows = await executeDataView('dvw-jfb-realized-daily-totals-v2', { p_project_id: projectId, p_start_date: projectStart })
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

    // Whole history, every date -- same as the non-native app's buildFlowStats,
    // which sums fetchProjectFlowHistory unbounded.
    const projectTotalGal = rows.reduce((a, r) => a + (Number(r.daily_total_gal) || 0), 0)
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

function fmtClimate(value, unit, decimals) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return `${decimals != null ? num.toFixed(decimals) : Math.round(num)} ${unit}`
}

export async function buildSafetyPageDataParam({ appSlug, projectId, reportId, dateISO, project }) {
  const [safetyRes, cultureRes, crewRes, equipmentRes, categoryLabelRows, precipSumRows, crewHoursRows] = await Promise.all([
    fetchDomainRecords({ domain: 'jfb_report_safety_v2', system: 'core', appSlug, filters: { report_id: reportId }, limit: 1 }),
    fetchDomainRecords({ domain: 'jfb_culture_tenants', system: 'core', appSlug, limit: 200 }),
    fetchDomainRecords({ domain: 'jfb_report_crew_summary_v2', system: 'core', appSlug, filters: { report_id: reportId }, limit: 200 }),
    fetchDomainRecords({ domain: 'jfb_project_site_equipment', system: 'core', appSlug, filters: { project_id: projectId }, limit: 1000 }),
    fetchPicklistValues('pkl-jfb-site-equipment-category'),
    executeDataView('dvw-jfb-precip-sums-v2', {
      p_project_id: projectId, p_month_start: `${dateISO.slice(0, 7)}-01`, p_end_date: dateISO,
    }),
    executeDataView('dvw-jfb-crew-hours-total-v2', { p_project_id: projectId }),
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

  const equipmentRows = (equipmentRes?.data ?? [])
    .filter((r) => {
      if (!r.mobilized_at || r.mobilized_at > dateISO) return false
      if (r.demobilized_at && r.demobilized_at < dateISO) return false
      return true
    })
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.sort_order ?? 0) - (b.sort_order ?? 0))

  // Grouped for the Safety page: one group per category, and one per COMPANY
  // within subcontractor -- a sub's kit is theirs, not a single bucket. A
  // subcontractor row whose company is still blank groups under a plain
  // "Subcontractor" heading rather than disappearing, so the PM can see it and
  // fill the field in.
  const equipmentGroups = []
  for (const r of equipmentRows) {
    const isSub = r.category === 'subcontractor'
    const company = isSub ? (r.company?.trim() || '') : ''
    const title = isSub
      ? (company ? `Subcontractor — ${company}` : 'Subcontractor')
      : (categoryLabels[r.category] ?? r.category)
    let g = equipmentGroups.find((x) => x.title === title)
    if (!g) equipmentGroups.push((g = { title, items: [] }))
    g.items.push(r.description || '')
  }

  // ONE-PAGE INVARIANT. The Safety page has to end with its signatures on page
  // one. Kalamazoo's roster alone is already at the density ceiling, so when
  // subcontractor rows exist AND the section crosses 55 items, every group
  // renders as one wrapped line rather than a list. With no subcontractor rows
  // this is always false and the page is unchanged for every other project.
  const subItemCount = equipmentGroups
    .filter((g) => g.title.startsWith('Subcontractor'))
    .reduce((a, g) => a + g.items.length, 0)
  const equipmentCrowded = subItemCount > 0 && equipmentRows.length > 55
  for (const g of equipmentGroups) g.inline = equipmentCrowded ? g.items.join('  ·  ') : null

  const [preparerSignatureDataUri, sshoSignatureDataUri] = await Promise.all([
    safety?.signature_image_path
      ? downloadAttachment(safety.signature_image_path).then(blobToDataUri)
      : Promise.resolve(null),
    safety?.ssho_signature_image_path
      ? downloadAttachment(safety.ssho_signature_image_path).then(blobToDataUri)
      : Promise.resolve(null),
  ])

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
    equipmentRows: equipmentRows.map((r) => ({
      category: categoryLabels[r.category] ?? r.category,
      description: r.description || '',
    })),
    equipmentGroups,
    equipmentCrowded,
    climate,
    showSsho: !!project?.show_ssho_field,
    preparerName: naOr(safety?.signature_name),
    preparerSignatureDataUri,
    sshoName: naOr(safety?.ssho_name),
    sshoSignatureDataUri,
  }
}

export async function buildCompletionChecklist({ appSlug, projectId, reportId, dateISO }) {

  const [activityRes, narrativeSections, photosRes, productionRes, metricsRes, metricValuesRes] = await Promise.all([
    fetchDomainRecords({
      domain: 'jfb_daily_activities', system: 'core', appSlug,
      filters: { project_id: projectId, report_date: dateISO },
      limit: 1000,
    }),
    buildNarrativeSectionsParam({ appSlug, projectId, reportId }),
    fetchDomainRecords({ domain: 'jfb_report_photos', system: 'core', appSlug, filters: { report_id: reportId }, limit: 50 }),
    fetchDomainRecords({ domain: 'jfb_production_stats', system: 'core', appSlug, filters: { report_id: reportId }, limit: 500 }),
    fetchDomainRecords({ domain: 'jfb_metrics', system: 'core', appSlug, filters: { project_id: projectId }, limit: 200 }),
    fetchDomainRecords({ domain: 'jfb_report_metric_value', system: 'core', appSlug, filters: { report_id: reportId }, limit: 200 }),
  ])

  const activities = (activityRes?.data ?? [])

  const photos = (photosRes?.data ?? []).filter((p) => p.photo_file_path)
  const acceptedPhotos = photos.filter((p) => p.label?.trim() && !p.pm_comment).length

  const production = productionRes?.data ?? []
  const productionEntered = production.filter((p) => p.volume !== null && p.volume !== undefined).length

  const manualMetrics = (metricsRes?.data ?? []).filter((m) => m.source === 'manual' && m.active !== false)
  const manualMetricKeys = new Set(manualMetrics.map((m) => m.metric_key).filter(Boolean))
  const metricKeyById = Object.fromEntries((metricsRes?.data ?? []).map((m) => [m.id, m.metric_key]))
  const metricValues = (metricValuesRes?.data ?? []).filter(
    (v) => manualMetricKeys.has(metricValueKey(v, metricKeyById)) && v.value !== null && v.value !== undefined && v.value !== '',
  )

  const narrativesFilled = narrativeSections.filter((s) => s.content.trim().length > 0).length

  const unattributed = activities.filter((a) => a.category === UNATTRIBUTED_CATEGORY).length

  return {
    event_log_reviewed: activities.length > 0 && unattributed === 0,
    transitions_added: true,
    production_stats_entered: productionEntered > 0,
    photos_complete: acceptedPhotos >= 2,
    narratives_complete: narrativeSections.length > 0 && narrativesFilled >= narrativeSections.length,
    metrics_entered: manualMetrics.length === 0 || metricValues.length >= manualMetrics.length,
  }
}

/**
 * The 5 PM-review checks (PMReviewPanel), distinct from the 6-item PE-facing
 * completion checklist above -- same idea, different thresholds, and this
 * one is never na'd out to "always passes" the way the old placeholder was.
 * Mirrors the non-native app's PMReviewPanel.tsx effect exactly, including
 * running as its own independent fetch rather than sharing data with
 * buildCompletionChecklist -- the reference app doesn't share between them
 * either, so neither does this.
 */
export async function buildPmReviewChecklist({ appSlug, projectId, reportId, dateISO, equipment }) {

  const [activityRes, productionRes, narrativeSections, photosRes] = await Promise.all([
    fetchDomainRecords({
      domain: 'jfb_daily_activities', system: 'core', appSlug,
      filters: { project_id: projectId, report_date: dateISO },
      limit: 1000,
    }),
    fetchDomainRecords({ domain: 'jfb_production_stats', system: 'core', appSlug, filters: { report_id: reportId }, limit: 500 }),
    buildNarrativeSectionsParam({ appSlug, projectId, reportId }),
    fetchDomainRecords({ domain: 'jfb_report_photos', system: 'core', appSlug, filters: { report_id: reportId }, limit: 50 }),
  ])

  const activities = (activityRes?.data ?? [])

  const checks = []

  checks.push({
    key: 'event_log',
    label: 'Event log present',
    status: activities.length > 0 ? 'pass' : 'fail',
    detail: activities.length > 0 ? `${activities.length} events across ${equipment.length} equipment` : 'No events synced',
  })

  const imbalanced = []
  for (const eq of equipment) {
    const eqEvents = activities.filter((a) => a.equipment_id === eq.id)
    const totals = shiftTotals(eqEvents)
    if (totals && !totals.balanced) {
      const imbalanceMinutes = Math.round((totals.ops + totals.delay - totals.shift) * 60)
      imbalanced.push(`${eq.name} (${imbalanceMinutes > 0 ? '+' : ''}${imbalanceMinutes} min)`)
    }
  }
  checks.push({
    key: 'shift_balance',
    label: 'Operational + Delay = Shift duration',
    status: activities.length === 0 ? 'na' : imbalanced.length === 0 ? 'pass' : 'fail',
    detail: activities.length === 0 ? 'No events to check' : imbalanced.length === 0 ? 'All equipment balanced' : `Imbalanced: ${imbalanced.join('; ')}`,
  })

  const production = productionRes?.data ?? []
  const statsWithValues = production.filter((p) => p.volume !== null && p.volume !== undefined)
  checks.push({
    key: 'production',
    label: 'Production stats entered',
    status: statsWithValues.length > 0 ? 'pass' : 'fail',
    detail: statsWithValues.length > 0 ? `${statsWithValues.length} row${statsWithValues.length === 1 ? '' : 's'} with values` : 'No production rows have a value entered',
  })

  const narrativesFilled = narrativeSections.filter((s) => s.content.trim().length > 0).length
  checks.push({
    key: 'narratives',
    label: 'Narratives complete',
    status: narrativesFilled >= narrativeSections.length ? 'pass' : 'fail',
    detail: `${narrativesFilled} of ${narrativeSections.length} sections written`,
  })

  const photos = (photosRes?.data ?? []).filter((p) => p.photo_file_path)
  const labeled = photos.filter((p) => p.label?.trim())
  const rejected = photos.filter((p) => p.pm_comment)
  let photoStatus
  let photoDetail
  if (photos.length < 2) {
    photoStatus = 'fail'
    photoDetail = `${photos.length} of 2 uploaded`
  } else if (labeled.length < 2) {
    photoStatus = 'fail'
    photoDetail = `${labeled.length} of 2 photos labeled`
  } else if (rejected.length > 0) {
    photoStatus = 'fail'
    photoDetail = `${rejected.length} photo${rejected.length === 1 ? '' : 's'} rejected — awaiting replacement`
  } else {
    photoStatus = 'pass'
    photoDetail = 'Both photos uploaded + labeled'
  }
  checks.push({ key: 'photos', label: 'Both photos uploaded + labeled', status: photoStatus, detail: photoDetail })

  return checks
}

/** Fetch every reading in a UTC window, paging past the API's per-call cap. */
async function fetchMonitoringReadings({ domain, appSlug, projectId, startUtc, endUtc }) {
  const PAGE = 1000
  const out = []
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetchDomainRecords({
      domain,
      system: 'core',
      appSlug,
      filters: { project_id: projectId, reading_at: { gte: startUtc, lt: endUtc } },
      limit: PAGE,
      offset,
    })
    const batch = Array.isArray(res) ? res : (res?.data ?? [])
    out.push(...batch)
    if (batch.length < PAGE) break
  }
  return out
}

/** A monitoring aerial is either a Pivotly attachment id or, on rows carried
 *  over from the old app, a direct image URL. Take both rather than printing a
 *  page with a hole in it; the URL form should be migrated to a Pivotly file. */
async function monitoringImageDataUri(pathOrId) {
  if (!pathOrId) return null
  try {
    if (isDirectImageUrl(pathOrId)) return await blobToDataUri(await fetchPublicAsset(pathOrId))
    return await blobToDataUri(await downloadAttachment(pathOrId))
  } catch {
    return null
  }
}

/**
 * Daily Air Monitoring page. Null when the project has no air_monitoring_config
 * or the date pulled no readings — the same gate the non-native uses, so a
 * project without monitoring prints exactly as it does today.
 */
export async function buildAirQualityParam({ appSlug, projectId, reportId, dateISO }) {
  const cfgRes = await fetchDomainRecords({
    domain: 'jfb_air_monitoring_config', system: 'core', appSlug,
    filters: { project_id: projectId }, limit: 1,
  })
  const config = (Array.isArray(cfgRes) ? cfgRes : (cfgRes?.data ?? []))[0]
  if (!config) return null

  const { startUtc, endUtc } = airWindowUtc(config, dateISO)
  const [readings, dailyRes] = await Promise.all([
    fetchMonitoringReadings({
      domain: 'jfb_air_quality_readings', appSlug, projectId,
      startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString(),
    }),
    fetchDomainRecords({
      domain: 'jfb_air_monitoring_daily', system: 'core', appSlug,
      filters: { report_id: reportId }, limit: 1,
    }),
  ])
  const daily = (Array.isArray(dailyRes) ? dailyRes : (dailyRes?.data ?? []))[0] ?? null

  const day = buildAirDay(config, readings, dateISO)
  if (day.populatedCount === 0) return null

  let llraChartDataUri = null
  let mbpChartDataUri = null
  try {
    // Portrait aspect — the two charts sit side by side on the bottom half of
    // the page, matching the Excel-era export.
    const specs = buildAirChartSpecs(day, config.stations, config.thresholds)
    llraChartDataUri = renderAirChart(day, specs.llra, { width: 900, height: 1150 }).dataUrl
    mbpChartDataUri = renderAirChart(day, specs.mbp, { width: 900, height: 1150 }).dataUrl
  } catch {
    // Charts are enhancement — the text page still ships.
  }

  return {
    equipmentText: config.equipment_text ?? null,
    calibrationText: config.calibration_text ?? null,
    notesText: config.notes_text ?? null,
    activity: daily?.activity ?? null,
    notes: daily?.notes ?? null,
    hasNotesBlock: !!(config.notes_text || daily?.notes || daily?.activity),
    aerialDataUri: await monitoringImageDataUri(config.aerial_path),
    llraChartDataUri,
    mbpChartDataUri,
  }
}

/**
 * Daily Water Monitoring page — the fixed-role (compliance) layout both live
 * projects use. The non-native also carries a TIDAL variant; no project has
 * tide data, and the native app has no tidal data layer, so it is not ported.
 */
export async function buildWaterQualityParam({ appSlug, projectId, reportId, dateISO }) {
  const cfgRes = await fetchDomainRecords({
    domain: 'jfb_water_monitoring_config', system: 'core', appSlug,
    filters: { project_id: projectId }, limit: 1,
  })
  const config = (Array.isArray(cfgRes) ? cfgRes : (cfgRes?.data ?? []))[0]
  if (!config) return null

  const { startUtc, endUtc } = reportWindowUtc(config, dateISO)
  const [readings, notesRes] = await Promise.all([
    fetchMonitoringReadings({
      domain: 'jfb_water_quality_readings', appSlug, projectId,
      startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString(),
    }),
    fetchDomainRecords({
      domain: 'jfb_water_monitoring_notes', system: 'core', appSlug,
      filters: { report_id: reportId }, limit: 1,
    }),
  ])
  const notesRow = (Array.isArray(notesRes) ? notesRes : (notesRes?.data ?? []))[0] ?? null

  const day = buildTurbidityDay(config, readings, dateISO)
  if (day.populatedCount === 0) return null

  let chartDataUri = null
  try {
    chartDataUri = renderTurbidityChart(day, config.thresholds, { width: 1100, height: 620 }).dataUrl
  } catch {
    // Chart is enhancement — the table still ships.
  }

  const refNtu = notesRow?.reference_ntu ?? null
  const ewDelta = config.thresholds?.early_warning_delta_ntu ?? null
  const compDelta = config.thresholds?.compliance_delta_ntu ?? null

  return {
    slots: day.slots.map((s) => ({
      timeLabel: s.timeLabel,
      background: fmtNtu(s.background),
      earlyWarning: fmtNtu(s.earlyWarning),
      compliance: fmtNtu(s.compliance),
      delta: fmtNtu(s.delta),
    })),
    avgDelta: fmtNtu(day.avgDelta),
    hasAvgDelta: day.avgDelta !== null,
    locations: (config.locations ?? []).map((l) => ({
      label: l.label ?? l.role ?? '',
      coords: l.display_coords ?? '',
    })),
    notes: notesRow?.notes ?? null,
    referenceNtu: fmtNtu(refNtu),
    earlyWarningDelta: ewDelta,
    complianceDelta: compDelta,
    responseActionNtu: fmtNtu(refNtu != null && ewDelta != null ? refNtu + ewDelta : null),
    notToExceedNtu: fmtNtu(refNtu != null && compDelta != null ? refNtu + compDelta : null),
    hasLimits: refNtu != null,
    aerialDataUri: await monitoringImageDataUri(config.aerial_path),
    chartDataUri,
  }
}

function fmtNtu(v) {
  return v === null || v === undefined ? '—' : Number(v).toFixed(2)
}
