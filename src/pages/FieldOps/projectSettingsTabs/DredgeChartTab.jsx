import { useRef, useState } from 'react'
import { Box, Button, Checkbox, FileButton, Group, Select, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { useEquipment } from '../../../hooks/useEquipment'
import { useProjectAreas } from '../../../hooks/useProjectAreas'
import { useDredgeEquipmentConfig } from '../../../hooks/useDredgeEquipmentConfig'
import { useDomainData } from '../../../hooks/useDomainData'
import { useReports } from '../../../hooks/useReports'
import { uploadAttachment, getAttachments, deleteAttachment, downloadAttachment, readWrittenRecordId } from '../../../data'
import { parseSurveyXyz, encodeRefSurface, gzipBytes, surveyFilenameDateISO, DEFAULT_REF_CELL_FT } from '../../../lib/dredge/designVolume'
import { isopachCsvToImage } from '../../../lib/dredge/earthworks'
import { fetchAerial } from '../../../lib/dredge/aerial'
import { renderChart, parseCells, parseReferenceLines, parseDxfPolylines, buildProgressDxfFromRings } from '../../../lib/dredge/chart'
import { ringArea } from '../../../lib/dredge/coverage'
import { loadAttachmentImage, loadPublicImage, loadTiles } from '../../../lib/dredge/imageLoaders'
import { makeZip } from '../../../lib/zip'

const DATA_SOURCES = [
  { value: 'hypack', label: 'HYPACK RAW folder — hydraulic dredge cutter track' },
  { value: 'earthworks', label: 'Trimble Earthworks surface export — mechanical/excavator, daily CSV' },
]

const VOLUME_MODES = [
  { value: '', label: 'Off — CY entered by hand' },
  { value: 'design_grade', label: 'Design grade & QA survey (hydraulic)' },
  { value: 'surface_diff', label: 'Daily surface drop (mechanical)' },
]

const BASEMAP_STYLES = [
  { value: 'topo', label: 'Topographic — lake as blue water, shoreline, roads, labels (best for shallow/marshy bays)' },
  { value: 'imagery', label: 'Satellite imagery — true-color aerial (best for open water / land sites)' },
]

function georefToFields(g) {
  return {
    westX: g?.wL != null ? String(g.wL) : '',
    eastX: g?.wR != null ? String(g.wR) : '',
    northY: g?.wT != null ? String(g.wT) : '',
    southY: g?.wB != null ? String(g.wB) : '',
  }
}
function fieldsToGeoref(f) {
  if (!f.westX.trim() || !f.eastX.trim() || !f.northY.trim() || !f.southY.trim()) return null
  return { wL: Number(f.westX), wR: Number(f.eastX), wT: Number(f.northY), wB: Number(f.southY) }
}

// Must match the real, published domain slug -- core.fnc_file_attach
// validates it against core.cfg_domain_info_cache_b and looks up the
// target record in usdf.<domain>_b, so this can't be a cosmetic/renamed
// label the way a plain storage namespace could be.
const DREDGE_CONFIG_DOMAIN = 'jfb_dredge_config'
const EQUIPMENT_CONFIG_DOMAIN = 'jfb_dredge_equipment_config'

// Every *_path field on jfb_dredge_config/jfb_dredge_equipment_config has a
// sibling <prefix>_original_name / <prefix>_storage_path pair -- uploadAttachment
// only ever sees a uniquified filename (see src/data/index.js), so the human
// name has to be recorded separately, and its response doesn't include the
// storage path, so it's read back via getAttachments right after. That
// lookup is best-effort only (storage_path is nice-to-have metadata, not
// required to link the file) -- if it fails for any reason, the critical
// part (pointing [field] at the uploaded file) still happens, just with
// *_storage_path left null instead of the whole save silently losing the
// upload. Also deletes whatever file this one is replacing, so config edits
// never pile up orphaned files.
async function replaceConfigFile({ coreRecordId, domain, field, uploadFile, originalName, previousFileId, extra, update }) {
  const res = await uploadAttachment({ coreRecordId, domain, file: uploadFile })
  let storagePath = null
  try {
    const rows = await getAttachments({ coreRecordId, domain })
    storagePath = rows.find((r) => r.fileId === res.fileId)?.storagePath ?? null
  } catch {
    // best-effort -- see comment above
  }
  const prefix = field.replace(/_path$/, '')
  await update({
    [field]: res.fileId,
    [`${prefix}_original_name`]: originalName ?? uploadFile.name,
    [`${prefix}_storage_path`]: storagePath,
    ...extra,
  })
  if (previousFileId && previousFileId !== res.fileId) {
    await deleteAttachment({ fileId: previousFileId, domain, coreRecordId })
  }
  return res
}

export default function DredgeChartTab({ project }) {
  const hasProject = !!project?.id
  const { records: dredgeConfigRecords, loading: configLoading, create: createDredgeConfig, update: updateDredgeConfig } =
    useDomainData({ domain: 'jfb_dredge_config', system: 'core', projectId: project?.id })

  if (!hasProject) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Select a project to manage its dredge chart.</Text>
  }
  if (configLoading) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Loading dredge chart settings…</Text>
  }

  const existingConfig = dredgeConfigRecords[0] ?? null

  return (
    <DredgeChartTabForm
      key={existingConfig?.id ?? 'new'}
      project={project}
      existingConfig={existingConfig}
      createDredgeConfig={createDredgeConfig}
      updateDredgeConfig={updateDredgeConfig}
    />
  )
}

function DredgeChartTabForm({ project, existingConfig, createDredgeConfig, updateDredgeConfig }) {
  const { equipment } = useEquipment(project.id)
  const { areas } = useProjectAreas(project.id)
  const areaOptions = (areas ?? [])
    .filter((a) => a.is_active !== false)
    .map((a) => ({ value: a.id, label: a.name }))
  const {
    equipmentConfigs, create: createEquipmentConfig, update: updateEquipmentConfig,
  } = useDredgeEquipmentConfig(project.id)
  const equipmentConfigByEquipmentId = new Map((equipmentConfigs ?? []).map((c) => [c.equipment_id, c]))
  const { reports, ensureReport } = useReports(project.id)
  const { records: progressRecords, create: createProgress, update: updateProgress } =
    useDomainData({ domain: 'jfb_dredge_progress', system: 'core', projectId: project.id })

  const [title, setTitle] = useState(existingConfig?.chart_title_override ?? '')
  const [areaId, setAreaId] = useState(existingConfig?.default_area_id ?? '')
  const [materials, setMaterials] = useState(existingConfig?.default_material_note ?? '')
  const [dataSource, setDataSource] = useState(existingConfig?.data_source ?? 'hypack')
  const [requireStations, setRequireStations] = useState(!!existingConfig?.require_stations)
  const [cellsReferenceOnly, setCellsReferenceOnly] = useState(!!existingConfig?.cells_reference_only)
  const [waterElev, setWaterElev] = useState(existingConfig?.water_elev_ft != null ? String(existingConfig.water_elev_ft) : '')
  const [crsText, setCrsText] = useState(existingConfig?.crs_definition ?? '')
  const [georef, setGeoref] = useState(() => georefToFields(existingConfig?.georef))
  const [aerialGeoref, setAerialGeoref] = useState(() => georefToFields(existingConfig?.aerial_georef))
  const [uploading, setUploading] = useState({})
  const [uploadErrors, setUploadErrors] = useState({})
  const [saveMsg, setSaveMsg] = useState('')
  const [saveError, setSaveError] = useState('')
  const [bucketWidth, setBucketWidth] = useState(existingConfig?.bucket_width_ft != null ? String(existingConfig.bucket_width_ft) : '')
  const [bedTol, setBedTol] = useState(existingConfig?.track_bed_tolerance_ft != null ? String(existingConfig.track_bed_tolerance_ft) : '')
  const [alignSnap, setAlignSnap] = useState(existingConfig?.alignment_snap_ft != null ? String(existingConfig.alignment_snap_ft) : '')
  const [splitGap, setSplitGap] = useState(existingConfig?.split_gap_ft != null ? String(existingConfig.split_gap_ft) : '')
  const [volumeMode, setVolumeMode] = useState(existingConfig?.volume_mode ?? '')
  const [designElev, setDesignElev] = useState(existingConfig?.design_elev_ft != null ? String(existingConfig.design_elev_ft) : '')
  const [refCell, setRefCell] = useState(existingConfig?.reference_cell_ft != null ? String(existingConfig.reference_cell_ft) : '')
  const [recovery, setRecovery] = useState(existingConfig?.volume_recovery_factor != null ? String(existingConfig.volume_recovery_factor) : '')
  const [refUploading, setRefUploading] = useState(false)
  const [refError, setRefError] = useState('')
  const [refMsg, setRefMsg] = useState('')
  const [aerialFetching, setAerialFetching] = useState(false)
  const [aerialFetchError, setAerialFetchError] = useState('')
  const [aerialFetchMsg, setAerialFetchMsg] = useState('')
  const [basemap, setBasemap] = useState('topo')
  const [priorEqId, setPriorEqId] = useState('')
  const [priorDate, setPriorDate] = useState('')
  const [priorFile, setPriorFile] = useState(null)
  const [priorBusy, setPriorBusy] = useState(false)
  const [priorMsg, setPriorMsg] = useState('')
  const [priorError, setPriorError] = useState('')
  const [previewEqId, setPreviewEqId] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewMsg, setPreviewMsg] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [previewGenerated, setPreviewGenerated] = useState(false)
  const previewCanvasRef = useRef(null)
  const [dxfBusy, setDxfBusy] = useState(false)
  const [dxfMsg, setDxfMsg] = useState('')
  const [dxfError, setDxfError] = useState('')

  // Every file field always stages here first, never uploads on pick --
  // exact parity with the reference app (DredgeChartManager.tsx keeps bgFile/
  // colorbarFile/aerialFile/etc. in local state regardless of whether cfg
  // exists yet; only its one saveProject() ever uploads anything). Keyed by
  // field name, flushed and cleared in handleSaveBackground. Fields with
  // their own downstream side effects (isopach CSV -> georef, aerial fetch ->
  // aerial_georef) stash those under `extra`, merged into the same patch that
  // sets the *_original_name/*_storage_path columns.
  const [stagedFiles, setStagedFiles] = useState({})
  const [stagedTiles, setStagedTiles] = useState({ isopach_tiles: [], aerial_tiles: [] })
  // Covers the whole save (create/update + flushing every staged file/tile),
  // not just the record write -- savingConfig (from useDomainData) only
  // covers that one write and would otherwise flip off while uploads are
  // still running.
  const [savingAll, setSavingAll] = useState(false)

  const showVolumeRecovery = volumeMode !== '' || dataSource === 'earthworks'

  async function handleSaveBackground() {
    setSaveMsg('')
    setSaveError('')
    setSavingAll(true)
    const recordData = {
      project_id: project.id,
      chart_title_override: title.trim() || null,
      default_area_id: areaId || null,
      default_material_note: materials.trim() || null,
      data_source: dataSource,
      water_elev_ft: waterElev.trim() === '' ? null : Number(waterElev),
      crs_definition: crsText.trim() || null,
      require_stations: requireStations,
      cells_reference_only: cellsReferenceOnly,
      georef: fieldsToGeoref(georef),
      aerial_georef: fieldsToGeoref(aerialGeoref),
      bucket_width_ft: bucketWidth.trim() === '' ? null : Number(bucketWidth),
      track_bed_tolerance_ft: bedTol.trim() === '' ? null : Number(bedTol),
      alignment_snap_ft: alignSnap.trim() === '' ? null : Number(alignSnap),
      split_gap_ft: splitGap.trim() === '' ? null : Number(splitGap),
      volume_mode: volumeMode === '' ? null : volumeMode,
      design_elev_ft: designElev.trim() === '' ? null : Number(designElev),
      reference_cell_ft: refCell.trim() === '' ? null : Number(refCell),
      volume_recovery_factor: recovery.trim() === '' ? null : Number(recovery),
    }
    try {
      let configId = existingConfig?.id ?? null
      if (existingConfig) {
        await updateDredgeConfig(existingConfig.id, recordData)
      } else {
        configId = readWrittenRecordId(await createDredgeConfig(recordData))
        if (!configId) throw new Error('Could not resolve the saved config record.')
      }

      for (const [field, staged] of Object.entries(stagedFiles)) {
        await replaceConfigFile({
          coreRecordId: configId,
          domain: DREDGE_CONFIG_DOMAIN,
          field,
          uploadFile: staged.file,
          originalName: staged.originalName,
          previousFileId: existingConfig?.[field] ?? null,
          extra: staged.extra,
          update: (patch) => updateDredgeConfig(configId, patch),
        })
      }
      if (Object.keys(stagedFiles).length) setStagedFiles({})

      for (const [fieldName, list] of Object.entries(stagedTiles)) {
        if (!list?.length) continue
        const uploadedTiles = []
        for (const t of list) {
          const res = await uploadAttachment({ coreRecordId: configId, domain: DREDGE_CONFIG_DOMAIN, file: t.file })
          uploadedTiles.push({ file_id: res.fileId, georef: t.georef })
        }
        const merged = [...(existingConfig?.[fieldName] ?? []), ...uploadedTiles]
        await updateDredgeConfig(configId, { [fieldName]: merged })
      }
      if (Object.values(stagedTiles).some((l) => l?.length)) setStagedTiles({ isopach_tiles: [], aerial_tiles: [] })

      setSaveMsg('Saved.')
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSavingAll(false)
    }
  }

  // Every field below always stages into stagedFiles and never uploads on
  // pick -- matching the reference app exactly (DredgeChartManager.tsx's
  // onBgPick/loadRefSurvey/autoFetchAerial all just set local File/Blob
  // state; only its one saveProject() ever uploads anything). No gating on
  // existingConfig either, for the same reason: nothing here needs the
  // record to exist yet, only handleSaveBackground's flush loop does.
  function handleUploadImage(field, file) {
    if (!file) return
    setUploadErrors((e) => ({ ...e, [field]: '' }))
    setStagedFiles((s) => ({ ...s, [field]: { file, originalName: file.name } }))
  }

  // Isopach upload: images pass through to handleUploadImage unchanged; a raw
  // CSV/ASC grid export (X,Y,DIFF) is rendered to a colored PNG client-side
  // and its georeference (computed from the data extent) fills in immediately
  // -- same as the reference's onBgPick.
  async function handleIsopachFile(file) {
    if (!file) return
    if (!/\.(csv|asc)$/i.test(file.name)) {
      return handleUploadImage('bg_path', file)
    }
    setUploadErrors((e) => ({ ...e, bg_path: '' }))
    setUploading((u) => ({ ...u, bg_path: true }))
    try {
      const { file: pngFile, georef: computedGeoref } = await isopachCsvToImage(await file.text())
      setStagedFiles((s) => ({ ...s, bg_path: { file: pngFile, originalName: file.name, extra: { georef: computedGeoref } } }))
      setGeoref(georefToFields(computedGeoref))
    } catch (err) {
      setUploadErrors((e) => ({ ...e, bg_path: err.message }))
    } finally {
      setUploading((u) => ({ ...u, bg_path: false }))
    }
  }

  // Parses the surveyor's gridded .xyz into the compact reference grid the
  // daily uses, then stages it -- matches the reference's loadRefSurvey()
  // exactly (it also only stores the gzipped blob in local state and waits
  // for Save).
  async function handleUploadReferenceSurvey(file) {
    if (!file) return
    setRefError('')
    setRefMsg('')
    setRefUploading(true)
    try {
      const cell = refCell.trim() === '' ? DEFAULT_REF_CELL_FT : Number(refCell)
      if (!Number.isFinite(cell) || cell <= 0) {
        throw new Error('Reference survey cell size must be a positive number (or blank for 2 ft).')
      }
      const { surface, points } = await parseSurveyXyz(file, cell, (pct, phase) => setRefMsg(`${phase} ${pct.toFixed(0)}%`))
      const gz = await gzipBytes(encodeRefSurface(surface))
      const gzFile = new File([gz], `${file.name}.jfbs.gz`, { type: 'application/gzip' })
      const surveyDate = surveyFilenameDateISO(file.name)
      setStagedFiles((s) => ({
        ...s,
        reference_surface_path: { file: gzFile, originalName: file.name, extra: { reference_surface_date: surveyDate, reference_cell_ft: cell } },
      }))
      const mb = (gz.size / 1e6).toFixed(1)
      const flownSuffix = surveyDate ? `, flown ${surveyDate}` : ''
      setRefMsg(`Read ${points.toLocaleString()} survey points → ${surface.nx}x${surface.ny} grid at ${cell} ft (${mb} MB)${flownSuffix} — click Save to apply.`)
    } catch (err) {
      setRefMsg('')
      setRefError(err.message)
    } finally {
      setRefUploading(false)
    }
  }

  // Pulls a georeferenced USGS aerial for the work-area bbox (the isopach
  // georef) and stages it -- matches the reference's autoFetchAerial()
  // exactly (it also only fills the aerial File + corner fields and tells
  // the user to click Save).
  async function handleFetchAerial() {
    setAerialFetchError('')
    setAerialFetchMsg('')
    const bbox = fieldsToGeoref(georef)
    if (!bbox) {
      setAerialFetchError('Enter the four work-area corners (the isopach georeference above) first, then fetch.')
      return
    }
    if (!crsText.trim()) {
      setAerialFetchError('Set the coordinate system (WKID / .prj) first.')
      return
    }
    setAerialFetching(true)
    try {
      const { blob, georef: fetchedGeoref } = await fetchAerial(bbox, crsText, { source: basemap })
      const file = new File([blob], 'aerial.png', { type: 'image/png' })
      const rounded = {
        wL: Math.round(fetchedGeoref.wL), wR: Math.round(fetchedGeoref.wR),
        wT: Math.round(fetchedGeoref.wT), wB: Math.round(fetchedGeoref.wB),
      }
      setStagedFiles((s) => ({ ...s, aerial_path: { file, originalName: 'aerial.png', extra: { aerial_georef: rounded } } }))
      setAerialGeoref(georefToFields(rounded))
      setAerialFetchMsg('Aerial fetched & aligned — click "Save background & labels" to apply.')
    } catch (err) {
      setAerialFetchError(err.message)
    } finally {
      setAerialFetching(false)
    }
  }

  // Seeds prior coverage from an imported as-built border DXF -- stored as a
  // jfb_dredge_progress row (no chart) for a baseline date, so progress-to-date
  // and 2nd-pass overlap work going forward without reprocessing old RAW.
  // Mirrors the reference's importPriorCoverage(): find-or-create the report
  // for that date, then UPDATE an existing progress row's rings in place (e.g.
  // backfilling onto a real dredging day) or INSERT a new one -- never touch
  // chart_path/pose on an update, so a saved chart isn't wiped.
  async function importPriorBaseline() {
    setPriorError('')
    setPriorMsg('')
    if (!priorEqId) { setPriorError('Pick the dredge.'); return }
    if (!priorDate) { setPriorError('Pick the baseline date.'); return }
    if (!priorFile) { setPriorError('Choose the as-built border DXF.'); return }
    setPriorBusy(true)
    try {
      const rings = parseDxfPolylines(await priorFile.text())
      if (!rings.length) throw new Error('No closed polylines found in that DXF.')
      // reports.find() rows are already flat domain records; a freshly-created
      // one from ensureReport() comes back wrapped by the write API (readWrittenRecordId
      // unwraps either shape safely -- see its use in PhotosTab.jsx for the same pattern).
      const existingReport = reports.find((r) => r.report_date === priorDate)
      const reportId = existingReport
        ? existingReport.id
        : readWrittenRecordId(await ensureReport({ project_id: project.id, report_date: priorDate, status: 'draft' }))
      if (!reportId) throw new Error('Could not resolve the report for that baseline date.')
      const sqft = Math.round(rings.reduce((s, r) => s + Math.abs(ringArea(r)), 0))
      const existingRow = (progressRecords ?? []).find((r) => r.report_id === reportId && r.equipment_id === priorEqId)
      if (existingRow) {
        await updateProgress(existingRow.id, { coverage_rings: rings, footprint_rings: rings })
      } else {
        await createProgress({
          project_id: project.id, report_id: reportId, equipment_id: priorEqId,
          chart_path: null, coverage_rings: rings, footprint_rings: rings,
          today_sqft: sqft, cumulative_sqft: sqft,
        })
      }
      setPriorFile(null)
      setPriorMsg(`Imported ${rings.length} polygon(s) as the ${priorDate} baseline.`)
    } catch (err) {
      setPriorError(err.message)
    } finally {
      setPriorBusy(false)
    }
  }

  // Dry-run the chart from the saved settings alone -- no live RAW data.
  // renderChart() frames off the isopach georef/tiles instead of a track when
  // todayPts is empty (preview: true) -- see chart.js. Any imported baseline
  // (see importPriorBaseline above) shows in green as progress-to-date.
  async function generatePreview() {
    setPreviewError('')
    setPreviewMsg('')
    if (!existingConfig) {
      setPreviewError('Save background & labels first, then preview.')
      return
    }
    const eq = equipment.find((e) => e.id === previewEqId) ?? equipment[0]
    const priorRings = eq
      ? (progressRecords ?? [])
          .filter((r) => r.equipment_id === eq.id)
          .flatMap((r) => r.footprint_rings ?? r.coverage_rings ?? [])
      : []
    setPreviewBusy(true)
    setPreviewGenerated(false)
    try {
      const [bgImage, aerialImage, colorbarImage, northImage, logoImage, isopachTiles, aerialTiles, cells, referenceLines] = await Promise.all([
        loadAttachmentImage(existingConfig.bg_path),
        loadAttachmentImage(existingConfig.aerial_path),
        loadAttachmentImage(existingConfig.colorbar_path),
        loadPublicImage('/dredge/_assets/north.png'),
        loadPublicImage('/dredge/_assets/logo.jpg'),
        loadTiles(existingConfig.isopach_tiles),
        loadTiles(existingConfig.aerial_tiles),
        existingConfig.cells_path
          ? downloadAttachment(existingConfig.cells_path).then((blob) => blob.text()).then(parseCells).catch(() => [])
          : Promise.resolve([]),
        existingConfig.reference_lines_path
          ? downloadAttachment(existingConfig.reference_lines_path).then((blob) => blob.text()).then(parseReferenceLines).catch(() => ({ segments: [], labels: [] }))
          : Promise.resolve({ segments: [], labels: [] }),
      ])
      renderChart(previewCanvasRef.current, {
        todayPts: [],
        preview: true,
        dateISO: new Date().toISOString().slice(0, 10),
        config: {
          projectTitle: `${existingConfig.chart_title_override || project.name} (SETUP PREVIEW)`,
          area: areaOptions.find((a) => a.value === existingConfig.default_area_id)?.label || '',
          materials: 'Setup preview — backgrounds & georeference only. Live dredge coverage appears here each day.',
          dredgeLabel: eq?.name || 'Dredge',
          bgImage, bgGeoref: existingConfig.georef ?? null,
          aerialImage, aerialGeoref: existingConfig.aerial_georef ?? null,
          colorbarImage, northImage, logoImage,
          isopachTiles, aerialTiles,
          cells, referenceLines,
        },
        priorRings,
        autoSecondPass: false,
        autoAdvance: false,
        showAdvanceLine: false,
      })
      setPreviewGenerated(true)
      setPreviewMsg(priorRings.length
        ? 'Preview generated — green shows the imported baseline (progress to date).'
        : 'Preview generated — backgrounds and georeference only (no baseline imported yet).')
    } catch (err) {
      setPreviewError(err.message)
    } finally {
      setPreviewBusy(false)
    }
  }

  function downloadPreviewPng() {
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = 'dredge-chart-preview.png'
    a.click()
  }

  // Rebuilds a progress DXF per saved (report, equipment) day from its stored
  // coverage/second-pass rings -- no server round trip beyond the data
  // already loaded for this tab -- and bundles them into one .zip. Mirrors
  // the reference's fetchAllDredgeDxfs()/downloadAllDxfs().
  async function handleDownloadAllDxfs() {
    setDxfError('')
    setDxfMsg('')
    setDxfBusy(true)
    try {
      const reportDateById = new Map(reports.map((r) => [r.id, r.report_date]))
      const equipmentNameById = new Map(equipment.map((e) => [e.id, e.name]))
      const safe = (s) => s.replace(/[^A-Za-z0-9._-]+/g, '_')
      const files = []
      for (const row of progressRecords ?? []) {
        const first = row.coverage_rings ?? []
        const second = row.second_pass_flags ?? []
        if (!first.length && !second.length) continue
        const date = reportDateById.get(row.report_id)
        if (!date) continue
        const eqName = safe(equipmentNameById.get(row.equipment_id) || row.equipment_id.slice(0, 8))
        files.push({ name: `progress_${date}_${eqName}.dxf`, text: buildProgressDxfFromRings(first, second) })
      }
      if (!files.length) {
        setDxfMsg('No saved dredge days yet.')
        return
      }
      files.sort((a, b) => a.name.localeCompare(b.name))
      const blob = makeZip(files)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'progress-dxfs.zip'
      a.click()
      URL.revokeObjectURL(url)
      setDxfMsg(`Downloaded ${files.length} DXF${files.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setDxfError(err.message)
    } finally {
      setDxfBusy(false)
    }
  }

  return (
    <Stack gap="lg">
      <Section
        title="Project background & labels"
        help="Used as the chart backdrop and header text. The background image is optional; without one the chart shows coverage on a plain map."
      >
        <Group grow>
          <TextInput label="Project title (chart header)" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
          <Select
            label="Area"
            placeholder={areaOptions.length === 0 ? 'No areas on this project' : 'Select…'}
            data={areaOptions}
            value={areaId || null}
            onChange={(v) => setAreaId(v ?? '')}
            clearable
            searchable
            disabled={areaOptions.length === 0}
          />
          <TextInput label="Default materials note" value={materials} onChange={(e) => setMaterials(e.currentTarget.value)} />
        </Group>

        <Box p={12} style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 6, background: 'var(--mantine-color-gray-0)' }}>
          <Stack gap={10}>
            <Select label="Position-data source" data={DATA_SOURCES} value={dataSource} onChange={(v) => setDataSource(v ?? 'hypack')} />

            {dataSource === 'earthworks' && (
              <Group grow align="flex-start">
                <Field label="Water surface elevation (project datum, ft) — required" help="Bucket readings at/above this are swing/dump artifacts, never progress.">
                  <TextInput value={waterElev} onChange={(e) => setWaterElev(e.currentTarget.value)} />
                </Field>
                <Field label="Design-grade surface CSV (X,Y,ELEV — optional)" help="Lets cuts in very shallow areas (design near water level) still count as progress.">
                  <FileControl
                    accept=".csv,.asc"
                    uploading={uploading.earthworks_design_path}
                    uploaded={!!existingConfig?.earthworks_design_path}
                    staged={!!stagedFiles.earthworks_design_path}
                    error={uploadErrors.earthworks_design_path}
                    onChange={(file) => handleUploadImage('earthworks_design_path', file)}
                  />
                </Field>
              </Group>
            )}

            {dataSource === 'earthworks' && (
              <Box pt={8} style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                <Text size="xs" fw={600} mb={8}>Machine track (daily Tracking DXF) — the primary source for the daily border.</Text>
                <Group grow mb={10}>
                  <Field label="Bucket width (ft)" help="Footprint stamped at each digging position.">
                    <TextInput value={bucketWidth} onChange={(e) => setBucketWidth(e.currentTarget.value)} />
                  </Field>
                  <Field label="Bed tolerance (ft)" help="Bucket teeth within this of the bed count as digging; higher = travelling.">
                    <TextInput value={bedTol} onChange={(e) => setBedTol(e.currentTarget.value)} />
                  </Field>
                </Group>
                <Group grow align="flex-start">
                  <Field label="Hard-structure alignment DXF (optional)" help="Sheet-pile wall / bulkhead alignment. The teeth can't sit on the sheets, so coverage that stops just short of it gets carried to it.">
                    <FileControl
                      accept=".dxf,application/dxf"
                      uploading={uploading.alignment_path}
                      uploaded={!!existingConfig?.alignment_path}
                      staged={!!stagedFiles.alignment_path}
                      error={uploadErrors.alignment_path}
                      onChange={(file) => handleUploadImage('alignment_path', file)}
                    />
                  </Field>
                  <Field label="Wall snap distance (ft)" help="Only gaps this narrow are closed, and only where the bucket already worked — unworked runs of wall stay empty.">
                    <TextInput value={alignSnap} onChange={(e) => setAlignSnap(e.currentTarget.value)} />
                  </Field>
                </Group>
              </Box>
            )}

            <Checkbox
              label="Require start & end stations before generating the daily chart"
              description="For stationed river/channel projects. The PE enters the day's station range on the Dredge Progress tab; it prints on the chart's Area line."
              checked={requireStations}
              onChange={(e) => setRequireStations(e.currentTarget.checked)}
            />

            <Field label="Split-view distance (ft)" help="When a day's coverage separates into areas whose footprints are more than this far apart (a large dredge move), the Dredge Progress tab offers to split the chart into zoomed per-area pages. Blank = 400 ft.">
              <TextInput value={splitGap} onChange={(e) => setSplitGap(e.currentTarget.value)} />
            </Field>

            <Box pt={8} style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
              <Text size="xs" fw={600} mb={8}>Estimated daily volume (CY) — off unless you turn it on here.</Text>
              <Group grow mb={10} align="flex-start">
                <Field label="Volume from" help="Design grade suits a cutter dredge: CY = the material still above design grade over the ground covered for the first time that day. Surface drop suits an excavator with daily Earthworks exports.">
                  <Select data={VOLUME_MODES} value={volumeMode} onChange={(v) => setVolumeMode(v ?? '')} />
                </Field>
                <Field label="Design grade elevation (ft)" help="Project datum.">
                  <TextInput value={designElev} onChange={(e) => setDesignElev(e.currentTarget.value)} />
                </Field>
                <Field label="Reference survey cell size (ft)" help="The survey is averaged down to this spacing so a lake-sized grid stays a few MB. Blank = 2 ft.">
                  <TextInput value={refCell} onChange={(e) => setRefCell(e.currentTarget.value)} />
                </Field>
              </Group>

              {showVolumeRecovery && (
                <Field
                  label="Volume recovery factor"
                  help={volumeMode === 'design_grade'
                    ? 'Reported CY = material above design grade x factor. Saved here so the daily starts from it; the PE can still nudge it on the Dredge Progress tab.'
                    : 'Reported CY = measured CY x factor (not all of the bucket cut reaches the barge). Tune against progress surveys.'}
                >
                  <TextInput value={recovery} onChange={(e) => setRecovery(e.currentTarget.value)} />
                </Field>
              )}

              {volumeMode === 'design_grade' && (
                <Field label="Latest QA pay survey (gridded 1x1 .xyz)" help="The surveyor's Gridded 1x1 Points.xyz deliverable. Re-upload after each survey so the estimate tracks the real bed.">
                  <FileControl
                    accept=".xyz,.csv,.txt"
                    uploading={refUploading}
                    uploaded={!!existingConfig?.reference_surface_path}
                    staged={!!stagedFiles.reference_surface_path}
                    error={refError}
                    onChange={handleUploadReferenceSurvey}
                  />
                  {existingConfig?.reference_surface_date && (
                    <Text size="10px" c="dimmed" mt={2}>Survey flown: {existingConfig.reference_surface_date}</Text>
                  )}
                  {refMsg && <Text size="10px" c="teal" mt={2}>{refMsg}</Text>}
                </Field>
              )}

              {volumeMode === 'design_grade' && (
                <Text size="10px" c="dimmed" p={8} mt={4} style={{ background: 'var(--mantine-color-gray-0)', border: '1px solid var(--mantine-color-gray-2)', borderRadius: 4 }}>
                  Reported CY = (material above design grade) x the recovery factor, because the cutter does not take the full prism everywhere it passes. Set the factor on the Dredge Progress tab and re-check it each survey cycle against the surveyor's payable volume.
                </Text>
              )}

              {volumeMode === 'surface_diff' && (
                <Text size="10px" c="dimmed" p={8} mt={4} style={{ background: 'var(--mantine-color-gray-0)', border: '1px solid var(--mantine-color-gray-2)', borderRadius: 4 }}>
                  Reported CY = (surface drop between today's full-surface export and the prior banked one) x the recovery
                  factor. A day-scoped export (just today's digging area) never carries volume -- only a full-surface
                  export does, and it's banked automatically on save so the next full-surface upload can diff against it.
                  Set the factor on the Dredge Progress tab and re-check it each survey cycle.
                </Text>
              )}
            </Box>
          </Stack>
        </Box>

        <Group grow align="flex-start">
          <Field label="Isopach / difference chart" help="Image (PNG/JPG) with corners entered below -- or a raw CSV/ASC grid export (X,Y,DIFF), which is colored and georeferenced automatically.">
            <FileControl
              accept="image/png,image/jpeg,image/webp,.csv,.asc"
              uploading={uploading.bg_path}
              uploaded={!!existingConfig?.bg_path}
              staged={!!stagedFiles.bg_path}
              error={uploadErrors.bg_path}
              onChange={handleIsopachFile}
            />
          </Field>
          <Field label="Isopach color-bar legend">
            <FileControl
              accept="image/png,image/jpeg"
              uploading={uploading.colorbar_path}
              uploaded={!!existingConfig?.colorbar_path}
              staged={!!stagedFiles.colorbar_path}
              error={uploadErrors.colorbar_path}
              onChange={(file) => handleUploadImage('colorbar_path', file)}
            />
          </Field>
        </Group>

        <TileManager
          label="Isopach"
          help="Optional — for lake-sized isopachs one image can't cover. Every tile whose corners overlap the day's view gets drawn; leave empty to use the single isopach image above."
          tiles={existingConfig?.isopach_tiles}
          stagedTiles={stagedTiles.isopach_tiles}
          onStagedTilesChange={(list) => setStagedTiles((s) => ({ ...s, isopach_tiles: list }))}
          onRemoveSavedTile={(idx) => updateDredgeConfig(existingConfig.id, { isopach_tiles: (existingConfig.isopach_tiles ?? []).filter((_, i) => i !== idx) })}
        />

        <Box p={12} style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 6, background: 'var(--mantine-color-gray-0)' }}>
          <Stack gap={10}>
            <Text size="xs" fw={600}>Aerial base layer (optional) — drawn behind the isopach for context/color around it.</Text>

            <Box p={10} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6, background: '#fff' }}>
              <Text size="xs" mb={8}>
                <b>Auto-fetch from USGS</b> — pulls a georeferenced basemap for the work area automatically (no export needed). Enter the work-area corners (the isopach georeference below) and set the coordinate system, then fetch.
              </Text>
              <Select label="Basemap style" data={BASEMAP_STYLES} value={basemap} onChange={(v) => setBasemap(v ?? 'topo')} mb={8} />
              <Textarea
                label="Coordinate system — WKID, or paste the project .prj (WKT)"
                value={crsText}
                onChange={(e) => setCrsText(e.currentTarget.value)}
                autosize
                minRows={2}
                mb={8}
              />
              <Button size="xs" loading={aerialFetching} onClick={handleFetchAerial} style={{ background: '#0F2744', border: 'none' }}>Fetch aerial automatically</Button>
              {aerialFetchMsg && <Text size="10px" c="teal" mt={4}>{aerialFetchMsg}</Text>}
              {aerialFetchError && <Text size="10px" c="red" mt={4}>{aerialFetchError}</Text>}
            </Box>

            <Text size="xs" c="dimmed">…or upload one manually:</Text>
            <Field label="Aerial image (PNG/JPG, project coords, clipped to the area)">
              <FileControl
                accept="image/png,image/jpeg,image/webp"
                uploading={uploading.aerial_path}
                uploaded={!!existingConfig?.aerial_path}
                staged={!!stagedFiles.aerial_path}
                error={uploadErrors.aerial_path}
                onChange={(file) => handleUploadImage('aerial_path', file)}
              />
            </Field>
            <Text size="xs" c="dimmed">Aerial georeference — corners of the aerial (auto-filled by Fetch, or from its world file).</Text>
            <GeoreferenceGrid value={aerialGeoref} onChange={setAerialGeoref} />

            <TileManager
              label="Aerial"
              help="Optional — multiple aerial tiles instead of one. Leave empty to use the single aerial image above."
              tiles={existingConfig?.aerial_tiles}
              stagedTiles={stagedTiles.aerial_tiles}
              onStagedTilesChange={(list) => setStagedTiles((s) => ({ ...s, aerial_tiles: list }))}
              onRemoveSavedTile={(idx) => updateDredgeConfig(existingConfig.id, { aerial_tiles: (existingConfig.aerial_tiles ?? []).filter((_, i) => i !== idx) })}
            />
          </Stack>
        </Box>

        <Field label="CSC / cell-grid DXF" help="Numbered confirmation-sampling cells (world coords), drawn as an outline + label overlay. Leave empty for open-water/isopach projects.">
          <FileControl
            accept=".dxf,application/dxf"
            uploading={uploading.cells_path}
            uploaded={!!existingConfig?.cells_path}
            staged={!!stagedFiles.cells_path}
            error={uploadErrors.cells_path}
            onChange={(file) => handleUploadImage('cells_path', file)}
          />
        </Field>

        <Checkbox
          label="Show cells as a reference overlay only"
          description="No per-foot grid, no clip-to-cells, no per-cell breakdown -- just outlines + numbers. For whole-project overviews where building the real grid over the full extent would be too large to render."
          checked={cellsReferenceOnly}
          onChange={(e) => setCellsReferenceOnly(e.currentTarget.checked)}
        />

        <Field label="Mile markers / stationing DXF" help="Open line segments + text labels (world coords) drawn as a thin reference overlay. Purely visual; not used in any calculation.">
          <FileControl
            accept=".dxf,application/dxf"
            uploading={uploading.reference_lines_path}
            uploaded={!!existingConfig?.reference_lines_path}
            staged={!!stagedFiles.reference_lines_path}
            error={uploadErrors.reference_lines_path}
            onChange={(file) => handleUploadImage('reference_lines_path', file)}
          />
        </Field>


        <Box>
          <Text size="xs" c="dimmed" mb={6}>Isopach georeference — the world coordinates (State Plane ft) of the isopach image corners. Leave blank if no isopach.</Text>
          <GeoreferenceGrid value={georef} onChange={setGeoref} />
        </Box>

        <Group>
          <Button size="xs" loading={savingAll} onClick={handleSaveBackground} style={{ background: '#0F2744', border: 'none' }}>
            Save background &amp; labels
          </Button>
          {saveMsg && <Text size="xs" c="green">{saveMsg}</Text>}
          {saveError && <Text size="xs" c="red">{saveError}</Text>}
        </Group>
      </Section>

      <Section title="Dredge shapes (per equipment)" help="Upload the CAD dredge-shape DXF for each dredge. The shape changes per job, so update it here when a dredge changes.">
        {equipment.length === 0 ? (
          <Text size="xs" c="dimmed">No active equipment on this project.</Text>
        ) : (
          <Stack gap={8}>
            {equipment.map((eq) => (
              <EquipmentShapeRow
                key={eq.id}
                equipment={eq}
                projectId={project.id}
                existingEquipmentConfig={equipmentConfigByEquipmentId.get(eq.id) ?? null}
                createEquipmentConfig={createEquipmentConfig}
                updateEquipmentConfig={updateEquipmentConfig}
              />
            ))}
          </Stack>
        )}
      </Section>

      <Section
        title="Prior coverage baseline (one-time)"
        help="If the project started before using this tool, import the team's as-built coverage border (DXF) up to the day before you begin. This seeds progress-to-date and the 2nd-pass overlap so they work from day one; the tool then accumulates each new day automatically."
      >
        <Group align="flex-end" wrap="wrap">
          <Select
            label="Dredge"
            placeholder="Select…"
            data={equipment.map((eq) => ({ value: eq.id, label: eq.name }))}
            value={priorEqId || null}
            onChange={(v) => setPriorEqId(v ?? '')}
            w={200}
          />
          <TextInput label="Baseline date (day before you start)" type="date" value={priorDate} onChange={(e) => setPriorDate(e.currentTarget.value)} />
          <FileControl accept=".dxf,application/dxf" label="As-built border DXF" onChange={setPriorFile} />
          <Button size="xs" variant="default" loading={priorBusy} onClick={importPriorBaseline}>Import baseline</Button>
        </Group>
        {priorFile && <Text size="10px" c="dimmed" mt={4}>Chosen: {priorFile.name}</Text>}
        {priorMsg && <Text size="10px" c="teal" mt={4}>{priorMsg}</Text>}
        {priorError && <Text size="10px" c="red" mt={4}>{priorError}</Text>}
      </Section>

      <Section
        title="Preview chart"
        help="Dry-run the chart from the saved settings above — backgrounds, georeference, labels, legend, and any imported baseline (green) — before the crew's first real day. No live data needed. Save your changes first."
      >
        <Group align="flex-end" wrap="wrap">
          <Select
            label="Dredge"
            placeholder={equipment.length === 0 ? 'No equipment' : 'Select…'}
            data={equipment.map((eq) => ({ value: eq.id, label: eq.name }))}
            value={previewEqId || null}
            onChange={(v) => setPreviewEqId(v ?? '')}
            w={200}
            disabled={equipment.length === 0}
          />
          <Button size="xs" loading={previewBusy} disabled={equipment.length === 0} onClick={generatePreview} style={{ background: '#0F2744', border: 'none' }}>Preview chart</Button>
        </Group>
        {previewMsg && <Text size="xs" c="teal" mt={8}>{previewMsg}</Text>}
        {previewError && <Text size="xs" c="red" mt={8}>{previewError}</Text>}
        <Box mt={10} style={{ textAlign: 'center', display: previewGenerated ? 'block' : 'none' }}>
          <canvas ref={previewCanvasRef} style={{ maxWidth: '100%', height: 'auto', border: '1px solid var(--mantine-color-gray-3)' }} />
          <Box mt={4}>
            <Text size="xs" c="blue" onClick={downloadPreviewPng} style={{ cursor: 'pointer', textDecoration: 'underline', display: 'inline-block' }}>
              Download preview PNG
            </Text>
          </Box>
        </Box>
      </Section>

      <Section
        title="Progress DXFs"
        help="Released dailies bank a progress DXF automatically (one per dredge). Download every saved day to-date as a single .zip — each is rebuilt from the stored coverage."
      >
        <Button size="xs" variant="default" loading={dxfBusy} onClick={handleDownloadAllDxfs}>Download all progress DXFs (.zip)</Button>
        {dxfMsg && <Text size="xs" c="teal" mt={4}>{dxfMsg}</Text>}
        {dxfError && <Text size="xs" c="red" mt={4}>{dxfError}</Text>}
      </Section>
    </Stack>
  )
}

function Section({ title, help, children }) {
  return (
    <Box style={{ borderTop: '1px solid var(--mantine-color-gray-2)', paddingTop: 16 }}>
      <Text fw={700} size="sm" mb={2}>{title}</Text>
      {help && <Text size="xs" c="dimmed" mb={12}>{help}</Text>}
      <Stack gap={12}>{children}</Stack>
    </Box>
  )
}

function Field({ label, help, children }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" mb={4}>{label}</Text>
      {children}
      {help && <Text size="10px" c="dimmed" mt={4}>{help}</Text>}
    </Box>
  )
}

// Manages a list of {file_id, georef} tiles on one array field (isopach_tiles
// or aerial_tiles). Mirrors the source's tiled-background concept: chart.js
// draws every tile whose corners overlap the day's view instead of one fixed
// image, for lake-sized projects one image can't cover. Newly added tiles
// stage as {file, georef} in the parent's stagedTiles (no upload here) --
// same "everything waits for Save" pattern as every other field on this tab.
function TileManager({ label, help, tiles, stagedTiles, onStagedTilesChange, onRemoveSavedTile }) {
  const [georefFields, setGeorefFields] = useState({ westX: '', eastX: '', northY: '', southY: '' })
  const [error, setError] = useState('')

  function handleAddTile(file) {
    if (!file) return
    const georef = fieldsToGeoref(georefFields)
    if (!georef) {
      setError('Enter all 4 corners before adding a tile.')
      return
    }
    setError('')
    onStagedTilesChange([...(stagedTiles ?? []), { file, georef }])
    setGeorefFields({ westX: '', eastX: '', northY: '', southY: '' })
  }

  function handleRemoveStagedTile(idx) {
    onStagedTilesChange((stagedTiles ?? []).filter((_, i) => i !== idx))
  }

  return (
    <Box p={10} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
      <Text size="xs" fw={600} mb={4}>{label} tiles ({(tiles ?? []).length + (stagedTiles ?? []).length})</Text>
      {help && <Text size="10px" c="dimmed" mb={8}>{help}</Text>}
      {((tiles ?? []).length > 0 || (stagedTiles ?? []).length > 0) && (
        <Stack gap={6} mb={10}>
          {(tiles ?? []).map((t, idx) => (
            <Group key={t.file_id ?? idx} justify="space-between" p={6} style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 4 }}>
              <Text size="10px" c="dimmed">
                Tile {idx + 1}: X [{t.georef?.wL}, {t.georef?.wR}] · Y [{t.georef?.wB}, {t.georef?.wT}]
              </Text>
              <Button size="xs" variant="subtle" color="red" onClick={() => onRemoveSavedTile(idx)}>Remove</Button>
            </Group>
          ))}
          {(stagedTiles ?? []).map((t, idx) => (
            <Group key={`staged-${idx}`} justify="space-between" p={6} style={{ background: 'var(--mantine-color-orange-0)', borderRadius: 4 }}>
              <Text size="10px" c="orange">
                Staged: {t.file.name} — X [{t.georef?.wL}, {t.georef?.wR}] · Y [{t.georef?.wB}, {t.georef?.wT}] (will upload on Save)
              </Text>
              <Button size="xs" variant="subtle" color="red" onClick={() => handleRemoveStagedTile(idx)}>Remove</Button>
            </Group>
          ))}
        </Stack>
      )}
      <Group grow mb={6}>
        <TextInput placeholder="West X" size="xs" value={georefFields.westX} onChange={(e) => { const v = e.currentTarget.value; setGeorefFields((f) => ({ ...f, westX: v })) }} />
        <TextInput placeholder="East X" size="xs" value={georefFields.eastX} onChange={(e) => { const v = e.currentTarget.value; setGeorefFields((f) => ({ ...f, eastX: v })) }} />
        <TextInput placeholder="North Y" size="xs" value={georefFields.northY} onChange={(e) => { const v = e.currentTarget.value; setGeorefFields((f) => ({ ...f, northY: v })) }} />
        <TextInput placeholder="South Y" size="xs" value={georefFields.southY} onChange={(e) => { const v = e.currentTarget.value; setGeorefFields((f) => ({ ...f, southY: v })) }} />
      </Group>
      <FileButton onChange={handleAddTile} accept="image/png,image/jpeg,image/webp">
        {(props) => <Button {...props} variant="default" size="xs">Add tile</Button>}
      </FileButton>
      {error && <Text size="10px" c="red" mt={4}>{error}</Text>}
    </Box>
  )
}

function FileControl({ accept, label, onChange, uploading, uploaded, staged, error }) {
  return (
    <Box>
      {label && <Text size="xs" c="dimmed" mb={4}>{label}</Text>}
      <Group gap={8} align="center">
        <FileButton onChange={onChange ?? (() => {})} accept={accept}>
          {(props) => <Button {...props} variant="default" size="xs" loading={uploading}>Choose File</Button>}
        </FileButton>
        {uploaded && !uploading && <Text size="xs" c="teal">Uploaded</Text>}
        {!uploaded && staged && !uploading && <Text size="xs" c="orange">Staged — will upload on Save</Text>}
      </Group>
      {error && <Text size="10px" c="red" mt={2}>{error}</Text>}
    </Box>
  )
}

function GeoreferenceGrid({ value, onChange }) {
  const set = (field) => (e) => onChange({ ...value, [field]: e.currentTarget.value })
  return (
    <Group grow>
      <TextInput label="West X (left)" value={value.westX} onChange={set('westX')} />
      <TextInput label="East X (right)" value={value.eastX} onChange={set('eastX')} />
      <TextInput label="North Y (top)" value={value.northY} onChange={set('northY')} />
      <TextInput label="South Y (bottom)" value={value.southY} onChange={set('southY')} />
    </Group>
  )
}

function EquipmentShapeRow({ equipment, projectId, existingEquipmentConfig, createEquipmentConfig, updateEquipmentConfig }) {
  const [label, setLabel] = useState(existingEquipmentConfig?.chart_label_override ?? equipment.name ?? '')
  const [stagedShape, setStagedShape] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveError, setSaveError] = useState('')

  // Mirrors the reference's EquipmentRow exactly: the shape file always
  // stages locally (handleUploadShape) and only this row's own Save
  // uploads it, whether the row already exists or is being created here.
  async function handleSave() {
    setSaveMsg('')
    setSaveError('')
    setSaving(true)
    const recordData = {
      project_id: projectId,
      equipment_id: equipment.id,
      chart_label_override: label.trim() || null,
    }
    try {
      let rowId = existingEquipmentConfig?.id ?? null
      if (existingEquipmentConfig) {
        await updateEquipmentConfig(existingEquipmentConfig.id, recordData)
      } else {
        rowId = readWrittenRecordId(await createEquipmentConfig(recordData))
        if (!rowId) throw new Error('Could not resolve the saved equipment record.')
      }
      if (stagedShape) {
        await replaceConfigFile({
          coreRecordId: rowId,
          domain: EQUIPMENT_CONFIG_DOMAIN,
          field: 'shape_path',
          uploadFile: stagedShape,
          previousFileId: existingEquipmentConfig?.shape_path ?? null,
          update: (patch) => updateEquipmentConfig(rowId, patch),
        })
        setStagedShape(null)
      }
      setSaveMsg('Saved.')
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleUploadShape(file) {
    if (!file) return
    setStagedShape(file)
  }

  return (
    <Group align="flex-end" wrap="wrap" p={10} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
      <Box style={{ minWidth: 140 }}>
        <Text size="xs" c="dimmed">{equipment.name}</Text>
        <TextInput value={label} onChange={(e) => setLabel(e.currentTarget.value)} placeholder="Chart label" size="xs" />
      </Box>
      <FileControl
        accept=".dxf,application/dxf"
        label="Dredge shape DXF"
        uploaded={!!existingEquipmentConfig?.shape_path}
        staged={!!stagedShape}
        onChange={handleUploadShape}
      />
      <Button size="xs" variant="default" loading={saving} onClick={handleSave}>Save</Button>
      {saveMsg && <Text size="xs" c="green">{saveMsg}</Text>}
      {saveError && <Text size="xs" c="red">{saveError}</Text>}
    </Group>
  )
}
