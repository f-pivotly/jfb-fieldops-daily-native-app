import { fetchDomainRecords, fetchAllDomainRecords, downloadAttachment } from '../../data'
import { renderChart, parseCells, detectClusterWindows } from './chart'
import { makeGrid, rasterizePolys, maskToPolys } from './coverage'
import { loadAttachmentImage, loadPublicImage, loadTiles } from './imageLoaders'

const DEFAULT_SPLIT_GAP_FT = 400
const ZOOM_MARGIN_FT = 250
const SCOPE_MARGIN_FT = 150
const INTRA_CELL_FT = 2
const INTRA_MAX_CELLS = 60_000_000

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

function ringCenter(r) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  return [(x0 + x1) / 2, (y0 + y1) / 2]
}

function pip(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function bboxWindow(rings) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const r of rings) for (const [x, y] of r) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return { minX: minX - 60, minY: minY - 60, maxX: maxX + 60, maxY: maxY + 60 }
}

const dayOf = (v) => (v ? String(v).slice(0, 10) : null)

async function fetchCoverageDays({ appSlug, projectId, throughISO }) {
  const [reports, progress] = await Promise.all([
    fetchAllDomainRecords({ domain: 'jfb_reports', system: 'core', appSlug, filters: { project_id: projectId } }),
    fetchAllDomainRecords({ domain: 'jfb_dredge_progress', system: 'core', appSlug, filters: { project_id: projectId } }),
  ])
  const reportDateById = new Map(reports.map((r) => [r.id, dayOf(r.report_date)]))
  const days = []
  for (const row of progress) {
    const date = reportDateById.get(row.report_id)
    if (!date || date > throughISO) continue
    const coverageRings = row.coverage_rings ?? []
    const footprintRings = row.footprint_rings?.length ? row.footprint_rings : null
    if (!coverageRings.length && !footprintRings) continue
    days.push({ equipmentId: row.equipment_id, date, coverageRings, footprintRings })
  }
  return days
}

export async function fetchWeekCoverage({ appSlug, projectId, weekStartISO, weekEndISO }) {
  const days = await fetchCoverageDays({ appSlug, projectId, throughISO: weekEndISO })
  const byEquipment = new Map()
  for (const d of days) {
    if (!d.coverageRings.length) continue
    if (!byEquipment.has(d.equipmentId)) byEquipment.set(d.equipmentId, { weekRings: [], priorRings: [] })
    const bucket = byEquipment.get(d.equipmentId)
    if (d.date >= weekStartISO) bucket.weekRings.push(...d.coverageRings)
    else bucket.priorRings.push(...d.coverageRings)
  }
  return byEquipment
}

function renderScopedCharts({ scopes, days, equipmentIds, configFor, labelFor, cells, completedCellLabels, weekStartISO, weekEndISO, dateText }) {
  const cellPolys = cells.filter((c) => c.label).map((c) => c.ring)
  const inCells = (ring) => {
    const [cx, cy] = ringCenter(ring)
    return cellPolys.some((p) => pip(cx, cy, p))
  }
  const ringInScope = (scope, ring) => (
    scope.chartRegion === 'csc-cells' ? inCells(ring)
      : scope.chartRegion === 'outside-csc-cells' ? !inCells(ring)
        : true
  )

  const out = []
  for (const equipmentId of equipmentIds) {
    const rows = days.filter((d) => d.equipmentId === equipmentId)
    if (!rows.length) continue
    const dredgeLabel = labelFor(equipmentId)
    for (const scope of scopes) {
      const scopeRows = rows.filter((r) => r.date >= scope.startISO)
      const weekDays = scopeRows
        .filter((r) => r.date >= weekStartISO && r.date <= weekEndISO)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => (r.footprintRings ?? r.coverageRings).filter((ring) => ringInScope(scope, ring)))
        .filter((rings) => rings.length > 0)
      const weekFoot = weekDays.flat()
      const priorCov = scopeRows
        .filter((r) => r.date < weekStartISO)
        .flatMap((r) => r.coverageRings.filter((ring) => ringInScope(scope, ring)))
      if (weekFoot.length === 0) continue

      const w = bboxWindow([...weekFoot, ...priorCov])
      let intraRings = []
      if (weekDays.length > 1) {
        const IG = makeGrid(w.minX, w.minY, w.maxX, w.maxY, INTRA_CELL_FT)
        if (Number.isFinite(IG.nx * IG.ny) && IG.nx * IG.ny <= INTRA_MAX_CELLS) {
          const acc = new Uint8Array(IG.nx * IG.ny)
          const intra = new Uint8Array(IG.nx * IG.ny)
          for (const dayRings of weekDays) {
            const m = rasterizePolys(dayRings, IG)
            for (let i = 0; i < m.length; i++) {
              if (m[i] && acc[i]) intra[i] = 1
              if (m[i]) acc[i] = 1
            }
          }
          intraRings = maskToPolys(intra, IG)
        }
      }

      const canvas = document.createElement('canvas')
      renderChart(canvas, {
        todayPts: [],
        dateISO: weekEndISO,
        config: { ...configFor(equipmentId), area: scope.label, materials: undefined },
        todayCoverageRings: weekFoot,
        priorRings: priorCov,
        secondPassRings: intraRings,
        autoSecondPass: true,
        autoAdvance: false,
        showAdvanceLine: false,
        completedCellLabels,
        titleText: `Weekly Dredge Progress Chart - ${dredgeLabel} — ${scope.label}`,
        dateText,
        viewWindow: {
          minX: w.minX - SCOPE_MARGIN_FT, minY: w.minY - SCOPE_MARGIN_FT,
          maxX: w.maxX + SCOPE_MARGIN_FT, maxY: w.maxY + SCOPE_MARGIN_FT,
        },
      })
      out.push({ label: `${dredgeLabel} — ${scope.label}`, dataUri: canvas.toDataURL('image/png') })
    }
  }
  return out
}

function renderAreaCharts({ days, equipmentIds, configFor, labelFor, splitGapFt, weekStartISO, dateText }) {
  const out = []
  for (const equipmentId of equipmentIds) {
    const rows = days.filter((d) => d.equipmentId === equipmentId && d.coverageRings.length)
    const weekRings = rows.filter((r) => r.date >= weekStartISO).flatMap((r) => r.coverageRings)
    const priorRings = rows.filter((r) => r.date < weekStartISO).flatMap((r) => r.coverageRings)
    if (!weekRings.length && !priorRings.length) continue
    const dredgeLabel = labelFor(equipmentId)

    const windows = detectClusterWindows([...weekRings, ...priorRings], splitGapFt)
    const touchesWeek = (w) => weekRings.some((r) => r.some(([x, y]) => x >= w.minX && x <= w.maxX && y >= w.minY && y <= w.maxY))
    const active = weekRings.length ? windows.filter(touchesWeek) : windows
    const views = windows.length >= 2 && active.length >= 1
      ? active.map((w, i) => ({ viewWindow: w, suffix: active.length > 1 ? ` — area ${i + 1} of ${active.length}` : '' }))
      : [{ viewWindow: null, suffix: '' }]

    if (weekRings.length) {
      const weekWins = detectClusterWindows(weekRings, splitGapFt)
      const zooms = weekWins.length ? weekWins : [bboxWindow(weekRings)]
      const full = views.length === 1 && views[0].viewWindow == null ? bboxWindow([...weekRings, ...priorRings]) : null
      const tightens = (z) => !full
        || ((z.maxX - z.minX) < 0.5 * (full.maxX - full.minX) || (z.maxY - z.minY) < 0.5 * (full.maxY - full.minY))
      let zi = 0
      for (const z of zooms) {
        if (!tightens(z)) continue
        zi += 1
        views.push({
          viewWindow: { minX: z.minX - ZOOM_MARGIN_FT, minY: z.minY - ZOOM_MARGIN_FT, maxX: z.maxX + ZOOM_MARGIN_FT, maxY: z.maxY + ZOOM_MARGIN_FT },
          suffix: zooms.length > 1 ? ` — this week (${zi})` : ' — this week',
        })
      }
    }

    for (const v of views) {
      const canvas = document.createElement('canvas')
      renderChart(canvas, {
        todayPts: [],
        preview: true,
        dateISO: weekStartISO,
        config: configFor(equipmentId),
        priorRings,
        highlightRings: weekRings,
        autoSecondPass: false,
        autoAdvance: false,
        showAdvanceLine: false,
        titleText: `Weekly Dredge Progress Chart - ${dredgeLabel}${v.suffix}`,
        dateText,
        viewWindow: v.viewWindow,
      })
      out.push({ label: `${dredgeLabel}${v.suffix}`, dataUri: canvas.toDataURL('image/png') })
    }
  }
  return out
}

export async function renderWeeklyProgressCharts({ appSlug, projectId, weekStartISO, weekEndISO }) {
  const [projectRes, dredgeConfigRes, equipmentConfigRows, areaRows, equipmentRows, scopeRows, cellStatusRows, days] = await Promise.all([
    fetchDomainRecords({ domain: 'jfb_projects', system: 'core', appSlug, filters: { id: projectId }, limit: 1 }),
    fetchDomainRecords({ domain: 'jfb_dredge_config', system: 'core', appSlug, filters: { project_id: projectId }, limit: 1 }),
    fetchAllDomainRecords({ domain: 'jfb_dredge_equipment_config', system: 'core', appSlug, filters: { project_id: projectId } }),
    fetchAllDomainRecords({ domain: 'jfb_project_areas', system: 'core', appSlug, filters: { project_id: projectId } }),
    fetchAllDomainRecords({ domain: 'jfb_equipments', system: 'core', appSlug, filters: { project_id: projectId } }),
    fetchAllDomainRecords({ domain: 'jfb_realized_scopes', system: 'core', appSlug, filters: { project_id: projectId } }),
    fetchAllDomainRecords({ domain: 'jfb_dredge_cell_status', system: 'core', appSlug, filters: { project_id: projectId } }).catch(() => []),
    fetchCoverageDays({ appSlug, projectId, throughISO: weekEndISO }),
  ])
  const project = projectRes?.data?.[0]
  const cfg = dredgeConfigRes?.data?.[0]
  if (!project || !cfg) return []

  const equipmentConfigByEqId = new Map(equipmentConfigRows.map((e) => [e.equipment_id, e]))
  const areaNameById = new Map(areaRows.map((a) => [a.id, a.name]))
  const equipmentById = new Map(equipmentRows.map((e) => [e.id, e]))

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

  const labelFor = (equipmentId) => equipmentConfigByEqId.get(equipmentId)?.label
    || equipmentById.get(equipmentId)?.name
    || 'Dredge'
  const configFor = (equipmentId) => ({
    projectTitle: cfg.chart_title_override || project.name,
    area: areaNameById.get(cfg.default_area_id) || '',
    materials: cfg.default_material_note || undefined,
    dredgeLabel: labelFor(equipmentId),
    cellsReferenceOnly: !!cfg.cells_reference_only,
    bgImage, bgGeoref: cfg.georef ?? null,
    aerialImage, aerialGeoref: cfg.aerial_georef ?? null,
    colorbarImage, northImage, logoImage,
    isopachTiles, aerialTiles,
    cells,
  })

  const equipmentIds = [...new Set(days.map((d) => d.equipmentId))].sort((a, b) => {
    const sa = equipmentById.get(a)?.sort_order ?? Number.MAX_SAFE_INTEGER
    const sb = equipmentById.get(b)?.sort_order ?? Number.MAX_SAFE_INTEGER
    return sa - sb || String(a).localeCompare(String(b))
  })
  const dateText = weekRangeText(weekStartISO, weekEndISO)

  const scopes = scopeRows
    .filter((s) => s.active !== false && s.start_date)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.start_date).localeCompare(String(b.start_date)))
    .map((s) => ({ label: s.label, startISO: dayOf(s.start_date), chartRegion: s.chart_region || null }))

  if (scopes.length >= 2) {
    const completedCellLabels = cellStatusRows
      .filter((c) => c.completed_on && dayOf(c.completed_on) <= weekEndISO)
      .map((c) => String(c.cell_label))
    const scoped = renderScopedCharts({
      scopes, days, equipmentIds, configFor, labelFor, cells, completedCellLabels,
      weekStartISO, weekEndISO, dateText,
    })
    if (scoped.length) return scoped
  }

  return renderAreaCharts({
    days, equipmentIds, configFor, labelFor,
    splitGapFt: Number(cfg.split_gap_ft) || DEFAULT_SPLIT_GAP_FT,
    weekStartISO, dateText,
  })
}
