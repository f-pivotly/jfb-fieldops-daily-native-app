import { fetchDomainRecords, downloadAttachment } from '../../data'
import { renderChart, parseCells } from './chart'
import { loadAttachmentImage, loadPublicImage, loadTiles } from './imageLoaders'

function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
}

function weekRangeText(weekStartISO, weekEndISO) {
  const start = shortDate(weekStartISO)
  const end = shortDate(weekEndISO)
  const sameYear = weekStartISO.slice(0, 4) === weekEndISO.slice(0, 4)
  return sameYear ? `${start.replace(/,\s*\d{4}$/, '')} - ${end}` : `${start} - ${end}`
}

async function loadCellsFor(path) {
  if (!path) return []
  try {
    const blob = await downloadAttachment(path)
    return parseCells(await blob.text())
  } catch {
    return []
  }
}

export async function fetchWeekCoverage({ appSlug, projectId, weekStartISO, weekEndISO }) {
  const [reportsRes, progressRes] = await Promise.all([
    fetchDomainRecords({ domain: 'jfb_reports', system: 'core', appSlug, filters: { project_id: projectId }, limit: 1000 }),
    fetchDomainRecords({ domain: 'jfb_dredge_progress', system: 'core', appSlug, filters: { project_id: projectId }, limit: 1000 }),
  ])
  const reportDateById = new Map((reportsRes?.data ?? []).map((r) => [r.id, r.report_date]))
  const byEquipment = new Map()
  for (const row of progressRes?.data ?? []) {
    const date = reportDateById.get(row.report_id)
    if (!date || date > weekEndISO) continue
    const rings = row.footprint_rings ?? row.coverage_rings ?? []
    if (!rings.length) continue
    if (!byEquipment.has(row.equipment_id)) byEquipment.set(row.equipment_id, { weekRings: [], priorRings: [] })
    const bucket = byEquipment.get(row.equipment_id)
    if (date >= weekStartISO) bucket.weekRings.push(...rings)
    else bucket.priorRings.push(...rings)
  }
  return byEquipment
}

export async function renderWeeklyProgressCharts({ appSlug, projectId, weekStartISO, weekEndISO }) {
  const [projectRes, dredgeConfigRes, equipmentConfigRes, areasRes, equipmentRes, coverage] = await Promise.all([
    fetchDomainRecords({ domain: 'jfb_projects', system: 'core', appSlug, filters: { id: projectId }, limit: 1 }),
    fetchDomainRecords({ domain: 'jfb_dredge_config', system: 'core', appSlug, filters: { project_id: projectId }, limit: 1 }),
    fetchDomainRecords({ domain: 'jfb_dredge_equipment_config', system: 'core', appSlug, filters: { project_id: projectId }, limit: 100 }),
    fetchDomainRecords({ domain: 'jfb_project_areas', system: 'core', appSlug, filters: { project_id: projectId }, limit: 1000 }),
    fetchDomainRecords({ domain: 'jfb_equipments', system: 'core', appSlug, filters: { project_id: projectId }, limit: 100 }),
    fetchWeekCoverage({ appSlug, projectId, weekStartISO, weekEndISO }),
  ])
  const project = projectRes?.data?.[0]
  const cfg = dredgeConfigRes?.data?.[0]
  if (!project || !cfg) return {}

  const equipmentConfigByEqId = new Map((equipmentConfigRes?.data ?? []).map((e) => [e.equipment_id, e]))
  const areaNameById = new Map((areasRes?.data ?? []).map((a) => [a.id, a.name]))
  const equipmentById = new Map((equipmentRes?.data ?? []).map((e) => [e.id, e]))

  const [bgImage, aerialImage, colorbarImage, northImage, logoImage, isopachTiles, aerialTiles, cells] = await Promise.all([
    loadAttachmentImage(cfg.bg_path),
    loadAttachmentImage(cfg.aerial_path),
    loadAttachmentImage(cfg.colorbar_path),
    loadPublicImage('/dredge/_assets/north.png'),
    loadPublicImage('/dredge/_assets/logo.jpg'),
    loadTiles(cfg.isopach_tiles),
    loadTiles(cfg.aerial_tiles),
    loadCellsFor(cfg.cells_path),
  ])

  const dateText = weekRangeText(weekStartISO, weekEndISO)
  const out = {}
  for (const [equipmentId, cov] of coverage) {
    if (!cov.weekRings.length && !cov.priorRings.length) continue
    const dredgeLabel = equipmentConfigByEqId.get(equipmentId)?.label
      || equipmentById.get(equipmentId)?.name
      || 'Dredge'
    const canvas = document.createElement('canvas')
    renderChart(canvas, {
      todayPts: [],
      preview: true,
      dateISO: weekStartISO,
      config: {
        projectTitle: cfg.chart_title_override || project.name,
        area: areaNameById.get(cfg.default_area_id) || '',
        materials: cfg.default_material_note || undefined,
        dredgeLabel,
        cellsReferenceOnly: !!cfg.cells_reference_only,
        bgImage, bgGeoref: cfg.georef ?? null,
        aerialImage, aerialGeoref: cfg.aerial_georef ?? null,
        colorbarImage, northImage, logoImage,
        isopachTiles, aerialTiles,
        cells,
      },
      priorRings: cov.priorRings,
      highlightRings: cov.weekRings,
      autoSecondPass: false,
      autoAdvance: false,
      showAdvanceLine: false,
      titleText: `Weekly Dredge Progress Chart - ${dredgeLabel}`,
      dateText,
    })
    out[equipmentId] = { dataUri: canvas.toDataURL('image/png'), label: dredgeLabel }
  }
  return out
}
