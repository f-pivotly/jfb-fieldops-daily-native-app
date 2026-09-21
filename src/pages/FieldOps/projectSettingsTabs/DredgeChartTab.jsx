import { useRef, useState } from 'react'
import { Box, Button, Checkbox, FileButton, Group, Select, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { useEquipment } from '../../../hooks/project/useEquipment'
import { useProjectAreas } from '../../../hooks/project/useProjectAreas'
import { useDredgeEquipmentConfig } from '../../../hooks/dredge/useDredgeEquipmentConfig'
import { useDomainData } from '../../../hooks/core/useDomainData'
import { useReports } from '../../../hooks/report/useReports'
import { useAttachmentUpload } from '../../../hooks/ui/useAttachmentUpload'
import { useAsyncAction } from '../../../hooks/ui/useAsyncAction'
import { useConfirmDialog } from '../../../hooks/ui/useConfirmDialog'
import { deleteAttachment, downloadAttachment, readWrittenRecordId } from '../../../data'
import { dredgeFileName, fileExtension, renameFile } from '../../../lib/dredge/fileNames'
import { todayISO } from '../lib/realizedToDate'
import { parseSurveyXyz, encodeRefSurface, gzipBytes, surveyFilenameDateISO, DEFAULT_REF_CELL_FT } from '../../../lib/dredge/designVolume'
import { isopachCsvToImage } from '../../../lib/dredge/earthworks'
import { fetchAerial } from '../../../lib/dredge/aerial'
import { renderChart, parseCells, parseReferenceLines, parseDxfPolylines, buildProgressDxfFromRings } from '../../../lib/dredge/chart'
import { ringArea } from '../../../lib/dredge/coverage'
import { loadAttachmentImage, loadPublicImage, loadTiles } from '../../../lib/dredge/imageLoaders'
import { makeZip } from '../../../lib/zip'
import { useStagedFiles } from '../../../hooks/ui/useStagedFiles'
import UploadedFile from './components/UploadedFile'
import StagedFilePreview from './components/StagedFilePreview'

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

const DREDGE_CONFIG_DOMAIN = 'jfb_dredge_config'
const EQUIPMENT_CONFIG_DOMAIN = 'jfb_dredge_equipment_config'

const FILE_KINDS = {
  bg_path: 'isopach',
  colorbar_path: 'colorbar',
  aerial_path: 'aerial',
  cells_path: 'cells',
  reference_lines_path: 'mile-markers',
  alignment_path: 'alignment',
  earthworks_design_path: 'design-grade',
  reference_surface_path: 'reference-survey',
}

export default function DredgeChartTab({ project }) {
  const hasProject = !!project?.id
  const { records: dredgeConfigRecords, loading: configLoading, create: createDredgeConfig, update: updateDredgeConfig } =
    useDomainData({ domain: 'jfb_dredge_config', system: 'core', projectId: project?.id })
  const [loadedProjectId, setLoadedProjectId] = useState(null)

  if (hasProject && !configLoading && loadedProjectId !== project.id) {
    setLoadedProjectId(project.id)
  }

  if (!hasProject) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Select a project to manage its dredge chart.</Text>
  }
  if (loadedProjectId !== project.id) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Loading dredge chart settings…</Text>
  }

  const existingConfig = dredgeConfigRecords[0] ?? null

  return (
    <DredgeChartTabForm
      key={project.id}
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
  const [bucketWidth, setBucketWidth] = useState(existingConfig?.bucket_width_ft != null ? String(existingConfig.bucket_width_ft) : '')
  const [bedTol, setBedTol] = useState(existingConfig?.track_bed_tolerance_ft != null ? String(existingConfig.track_bed_tolerance_ft) : '')
  const [alignSnap, setAlignSnap] = useState(existingConfig?.alignment_snap_ft != null ? String(existingConfig.alignment_snap_ft) : '')
  const [splitGap, setSplitGap] = useState(existingConfig?.split_gap_ft != null ? String(existingConfig.split_gap_ft) : '')
  const [volumeMode, setVolumeMode] = useState(existingConfig?.volume_mode ?? '')
  const [designElev, setDesignElev] = useState(existingConfig?.design_elev_ft != null ? String(existingConfig.design_elev_ft) : '')
  const [refCell, setRefCell] = useState(existingConfig?.reference_cell_ft != null ? String(existingConfig.reference_cell_ft) : '')
  const [recovery, setRecovery] = useState(existingConfig?.volume_recovery_factor != null ? String(existingConfig.volume_recovery_factor) : '')
  const [basemap, setBasemap] = useState('topo')
  const [priorEqId, setPriorEqId] = useState('')
  const [priorDate, setPriorDate] = useState('')
  const [priorFile, setPriorFile] = useState(null)
  const [previewEqId, setPreviewEqId] = useState('')
  const [previewGenerated, setPreviewGenerated] = useState(false)
  const previewCanvasRef = useRef(null)

  const { busy: savingAll, message: saveMsg, error: saveError, run: runSaveAll } = useAsyncAction()
  const { busy: refUploading, message: refMsg, error: refError, run: runRefUpload, markSuccess: markRefProgress } = useAsyncAction()
  const { busy: aerialFetching, message: aerialFetchMsg, error: aerialFetchError, run: runAerialFetch, markError: markAerialError } = useAsyncAction()
  const { busy: priorBusy, message: priorMsg, error: priorError, run: runPrior, markError: markPriorError } = useAsyncAction()
  const { busy: previewBusy, message: previewMsg, error: previewError, run: runPreview, markError: markPreviewError } = useAsyncAction()
  const { busy: dxfBusy, message: dxfMsg, error: dxfError, run: runDxf } = useAsyncAction()

  const { stagedFiles, stagedTiles, stageFile, unstageFile, stageTiles, flushFiles, flushTiles } = useStagedFiles()
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const [removingField, setRemovingField] = useState(null)

  const showVolumeRecovery = volumeMode !== '' || dataSource === 'earthworks'

  function stageRenamed(field, file, { originalName, extra, ext } = {}) {
    const name = dredgeFileName({
      project,
      kind: FILE_KINDS[field],
      dateISO: todayISO(),
      ext: ext ?? fileExtension(file.name),
    })
    stageFile(field, renameFile(file, name), { originalName: originalName ?? file.name, extra })
  }

  function renameTile(kind) {
    return (file, number) => renameFile(file, dredgeFileName({
      project,
      kind,
      dateISO: todayISO(),
      index: number,
      ext: fileExtension(file.name),
    }))
  }

  async function handleRemoveFile(field) {
    const fileId = existingConfig?.[field]
    if (!existingConfig || !fileId) return
    const prefix = field.replace(/_path$/, '')
    const name = existingConfig[`${prefix}_original_name`] || 'this file'
    if (!(await confirm(`Remove ${name}? The stored file will be deleted.`))) return
    setRemovingField(field)
    setUploadErrors((e) => ({ ...e, [field]: '' }))
    try {
      await updateDredgeConfig(existingConfig.id, {
        [field]: null,
        [`${prefix}_original_name`]: null,
        [`${prefix}_storage_path`]: null,
        ...(field === 'reference_surface_path' ? { reference_surface_date: null } : {}),
      })
      await deleteAttachment({ fileId, domain: DREDGE_CONFIG_DOMAIN, coreRecordId: existingConfig.id })
        .catch((err) => console.error('Could not delete the removed file:', err.message))
    } catch (err) {
      setUploadErrors((e) => ({ ...e, [field]: err.message }))
    } finally {
      setRemovingField(null)
    }
  }

  async function handleRemoveSavedTile(key, idx) {
    const tiles = existingConfig?.[key] ?? []
    const tile = tiles[idx]
    if (!existingConfig || !tile) return
    const name = tile.original_name ? ` (${tile.original_name})` : ''
    if (!(await confirm(`Remove tile ${idx + 1}${name}? The stored file will be deleted.`))) return
    await updateDredgeConfig(existingConfig.id, { [key]: tiles.filter((_, i) => i !== idx) })
    if (tile.file_id) {
      await deleteAttachment({ fileId: tile.file_id, domain: DREDGE_CONFIG_DOMAIN, coreRecordId: existingConfig.id })
        .catch((err) => console.error('Could not delete the removed tile file:', err.message))
    }
  }

  function fileControlProps(field) {
    const prefix = field.replace(/_path$/, '')
    return {
      uploading: uploading[field],
      fileId: existingConfig?.[field],
      fileName: existingConfig?.[`${prefix}_original_name`],
      staged: stagedFiles[field],
      error: uploadErrors[field],
      onUnstage: () => unstageFile(field),
      onRemove: () => handleRemoveFile(field),
      removing: removingField === field,
    }
  }

  async function handleSaveBackground() {
    await runSaveAll(async () => {
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
      let configId = existingConfig?.id ?? null
      if (existingConfig) {
        await updateDredgeConfig(existingConfig.id, recordData)
      } else {
        configId = readWrittenRecordId(await createDredgeConfig(recordData))
        if (!configId) throw new Error('Could not resolve the saved config record.')
      }

      const update = (patch) => updateDredgeConfig(configId, patch)
      await flushFiles({ recordId: configId, domain: DREDGE_CONFIG_DOMAIN, existing: existingConfig, update })
      await flushTiles({ recordId: configId, domain: DREDGE_CONFIG_DOMAIN, existing: existingConfig, update })

      return 'Saved.'
    })
  }

  function handleUploadImage(field, file) {
    if (!file) return
    setUploadErrors((e) => ({ ...e, [field]: '' }))
    stageRenamed(field, file)
  }

  async function handleIsopachFile(file) {
    if (!file) return
    if (!/\.(csv|asc)$/i.test(file.name)) {
      return handleUploadImage('bg_path', file)
    }
    setUploadErrors((e) => ({ ...e, bg_path: '' }))
    setUploading((u) => ({ ...u, bg_path: true }))
    try {
      const { file: pngFile, georef: computedGeoref } = await isopachCsvToImage(await file.text())
      stageRenamed('bg_path', pngFile, { originalName: file.name, extra: { georef: computedGeoref }, ext: 'png' })
      setGeoref(georefToFields(computedGeoref))
    } catch (err) {
      setUploadErrors((e) => ({ ...e, bg_path: err.message }))
    } finally {
      setUploading((u) => ({ ...u, bg_path: false }))
    }
  }

  async function handleUploadReferenceSurvey(file) {
    if (!file) return
    await runRefUpload(async () => {
      const cell = refCell.trim() === '' ? DEFAULT_REF_CELL_FT : Number(refCell)
      if (!Number.isFinite(cell) || cell <= 0) {
        throw new Error('Reference survey cell size must be a positive number (or blank for 2 ft).')
      }
      const { surface, points } = await parseSurveyXyz(file, cell, (pct, phase) => markRefProgress(`${phase} ${pct.toFixed(0)}%`))
      const gz = await gzipBytes(encodeRefSurface(surface))
      const gzFile = new File([gz], `${file.name}.jfbs.gz`, { type: 'application/gzip' })
      const surveyDate = surveyFilenameDateISO(file.name)
      stageRenamed('reference_surface_path', gzFile, { originalName: file.name, ext: 'jfbs.gz', extra: { reference_surface_date: surveyDate, reference_cell_ft: cell } })
      const mb = (gz.size / 1e6).toFixed(1)
      const flownSuffix = surveyDate ? `, flown ${surveyDate}` : ''
      return `Read ${points.toLocaleString()} survey points → ${surface.nx}x${surface.ny} grid at ${cell} ft (${mb} MB)${flownSuffix} — click Save to apply.`
    })
  }

  async function handleFetchAerial() {
    const bbox = fieldsToGeoref(georef)
    if (!bbox) {
      markAerialError('Enter the four work-area corners (the isopach georeference above) first, then fetch.')
      return
    }
    if (!crsText.trim()) {
      markAerialError('Set the coordinate system (WKID / .prj) first.')
      return
    }
    await runAerialFetch(async () => {
      const { blob, georef: fetchedGeoref } = await fetchAerial(bbox, crsText, { source: basemap })
      const file = new File([blob], 'aerial.png', { type: 'image/png' })
      const rounded = {
        wL: Math.round(fetchedGeoref.wL), wR: Math.round(fetchedGeoref.wR),
        wT: Math.round(fetchedGeoref.wT), wB: Math.round(fetchedGeoref.wB),
      }
      stageRenamed('aerial_path', file, { originalName: `usgs-${basemap}-basemap.png`, ext: 'png', extra: { aerial_georef: rounded } })
      setAerialGeoref(georefToFields(rounded))
      return 'Aerial fetched & aligned — click "Save background & labels" to apply.'
    })
  }

  async function importPriorBaseline() {
    if (!priorEqId) { markPriorError('Pick the dredge.'); return }
    if (!priorDate) { markPriorError('Pick the baseline date.'); return }
    if (!priorFile) { markPriorError('Choose the as-built border DXF.'); return }
    await runPrior(async () => {
      const rings = parseDxfPolylines(await priorFile.text())
      if (!rings.length) throw new Error('No closed polylines found in that DXF.')
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
      return `Imported ${rings.length} polygon(s) as the ${priorDate} baseline.`
    })
  }

  async function generatePreview() {
    if (!existingConfig) {
      markPreviewError('Save background & labels first, then preview.')
      return
    }
    const eq = equipment.find((e) => e.id === previewEqId) ?? equipment[0]
    const priorRings = eq
      ? (progressRecords ?? [])
          .filter((r) => r.equipment_id === eq.id)
          .flatMap((r) => r.footprint_rings ?? r.coverage_rings ?? [])
      : []
    setPreviewGenerated(false)
    await runPreview(async () => {
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
      return priorRings.length
        ? 'Preview generated — green shows the imported baseline (progress to date).'
        : 'Preview generated — backgrounds and georeference only (no baseline imported yet).'
    })
  }

  function downloadPreviewPng() {
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = 'dredge-chart-preview.png'
    a.click()
  }

  async function handleDownloadAllDxfs() {
    await runDxf(async () => {
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
      if (!files.length) return 'No saved dredge days yet.'
      files.sort((a, b) => a.name.localeCompare(b.name))
      const blob = makeZip(files)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'progress-dxfs.zip'
      a.click()
      URL.revokeObjectURL(url)
      return `Downloaded ${files.length} DXF${files.length === 1 ? '' : 's'}.`
    })
  }

  return (
    <Stack gap="lg">
      {confirmModal}
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
                    {...fileControlProps('earthworks_design_path')}
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
                      {...fileControlProps('alignment_path')}
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
                    {...fileControlProps('reference_surface_path')}
                    uploading={refUploading}
                    error={refError || uploadErrors.reference_surface_path}
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
              {...fileControlProps('bg_path')}
              onChange={handleIsopachFile}
            />
          </Field>
          <Field label="Isopach color-bar legend">
            <FileControl
              accept="image/png,image/jpeg"
              {...fileControlProps('colorbar_path')}
              onChange={(file) => handleUploadImage('colorbar_path', file)}
            />
          </Field>
        </Group>

        <TileManager
          label="Isopach"
          help="Optional — for lake-sized isopachs one image can't cover. Every tile whose corners overlap the day's view gets drawn; leave empty to use the single isopach image above."
          tiles={existingConfig?.isopach_tiles}
          stagedTiles={stagedTiles.isopach_tiles}
          renameTile={renameTile('isopach-tile')}
          onStagedTilesChange={(list) => stageTiles('isopach_tiles', list)}
          onRemoveSavedTile={(idx) => handleRemoveSavedTile('isopach_tiles', idx)}
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
                {...fileControlProps('aerial_path')}
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
              renameTile={renameTile('aerial-tile')}
              onStagedTilesChange={(list) => stageTiles('aerial_tiles', list)}
              onRemoveSavedTile={(idx) => handleRemoveSavedTile('aerial_tiles', idx)}
            />
          </Stack>
        </Box>

        <Field label="CSC / cell-grid DXF" help="Numbered confirmation-sampling cells (world coords), drawn as an outline + label overlay. Leave empty for open-water/isopach projects.">
          <FileControl
            accept=".dxf,application/dxf"
            {...fileControlProps('cells_path')}
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
            {...fileControlProps('reference_lines_path')}
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
                project={project}
                existingEquipmentConfig={equipmentConfigByEquipmentId.get(eq.id) ?? null}
                createEquipmentConfig={createEquipmentConfig}
                updateEquipmentConfig={updateEquipmentConfig}
                confirm={confirm}
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

function TileManager({ label, help, tiles, stagedTiles, renameTile, onStagedTilesChange, onRemoveSavedTile }) {
  const [georefFields, setGeorefFields] = useState({ westX: '', eastX: '', northY: '', southY: '' })
  const [error, setError] = useState('')
  const [removingIdx, setRemovingIdx] = useState(null)
  const savedCount = (tiles ?? []).length
  const stagedCount = (stagedTiles ?? []).length

  function handleAddTile(file) {
    if (!file) return
    const georef = fieldsToGeoref(georefFields)
    if (!georef) {
      setError('Enter all 4 corners before adding a tile.')
      return
    }
    setError('')
    const number = savedCount + stagedCount + 1
    const stored = renameTile ? renameTile(file, number) : file
    onStagedTilesChange([...(stagedTiles ?? []), { file: stored, originalName: file.name, georef }])
    setGeorefFields({ westX: '', eastX: '', northY: '', southY: '' })
  }

  function handleRemoveStagedTile(idx) {
    onStagedTilesChange((stagedTiles ?? []).filter((_, i) => i !== idx))
  }

  async function handleRemoveSavedTile(idx) {
    setError('')
    setRemovingIdx(idx)
    try {
      await onRemoveSavedTile(idx)
    } catch (err) {
      setError(err.message)
    } finally {
      setRemovingIdx(null)
    }
  }

  const corners = (g) => `X [${g?.wL}, ${g?.wR}] · Y [${g?.wB}, ${g?.wT}]`

  return (
    <Box p={10} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
      <Text size="xs" fw={600} mb={4}>{label} tiles ({savedCount + stagedCount})</Text>
      {help && <Text size="10px" c="dimmed" mb={8}>{help}</Text>}
      {(savedCount > 0 || stagedCount > 0) && (
        <Stack gap={6} mb={10}>
          {(tiles ?? []).map((t, idx) => (
            <Group key={t.file_id ?? idx} justify="space-between" wrap="nowrap" p={6} style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 4 }}>
              <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
                <Text size="10px" c="dimmed" style={{ whiteSpace: 'nowrap' }}>Tile {idx + 1}</Text>
                {t.file_id && <UploadedFile key={t.file_id} fileId={t.file_id} fileName={t.original_name} />}
                <Text size="10px" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{corners(t.georef)}</Text>
              </Group>
              <Button size="xs" variant="subtle" color="red" loading={removingIdx === idx} onClick={() => handleRemoveSavedTile(idx)}>Remove</Button>
            </Group>
          ))}
          {(stagedTiles ?? []).map((t, idx) => (
            <Group key={`staged-${idx}`} justify="space-between" wrap="nowrap" p={6} style={{ background: 'var(--mantine-color-orange-0)', borderRadius: 4 }}>
              <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
                <Text size="10px" c="orange" style={{ whiteSpace: 'nowrap' }}>Tile {savedCount + idx + 1}</Text>
                <StagedFilePreview file={t.file} name={t.originalName} />
                <Text size="10px" c="orange" style={{ whiteSpace: 'nowrap' }}>{corners(t.georef)}</Text>
              </Group>
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

function FileControl({ accept, label, onChange, uploading, fileId, fileName, staged, error, onUnstage, onRemove, removing }) {
  const showSaved = !!fileId && !uploading && !staged
  const showStaged = !!staged && !uploading
  return (
    <Box>
      {label && <Text size="xs" c="dimmed" mb={4}>{label}</Text>}
      <Group gap={8} align="center">
        <FileButton onChange={onChange ?? (() => {})} accept={accept}>
          {(props) => <Button {...props} variant="default" size="xs" loading={uploading}>Choose File</Button>}
        </FileButton>
        {showSaved && <UploadedFile key={fileId} fileId={fileId} fileName={fileName} />}
        {showSaved && onRemove && (
          <Button size="xs" variant="subtle" color="red" loading={removing} onClick={onRemove}>Remove</Button>
        )}
        {showStaged && <StagedFilePreview file={staged.file} name={staged.originalName} />}
        {showStaged && onUnstage && (
          <Button size="xs" variant="subtle" color="gray" onClick={onUnstage}>Undo</Button>
        )}
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

function EquipmentShapeRow({ equipment, project, existingEquipmentConfig, createEquipmentConfig, updateEquipmentConfig, confirm }) {
  const [label, setLabel] = useState(existingEquipmentConfig?.chart_label_override ?? equipment.name ?? '')
  const [stagedShape, setStagedShape] = useState(null)
  const { busy: saving, message: saveMsg, error: saveError, run: runSave } = useAsyncAction()
  const { busy: removing, error: removeError, run: runRemove } = useAsyncAction()
  const shapeUpload = useAttachmentUpload()

  async function handleSave() {
    await runSave(async () => {
      const recordData = {
        project_id: project.id,
        equipment_id: equipment.id,
        chart_label_override: label.trim() || null,
      }
      let rowId = existingEquipmentConfig?.id ?? null
      if (existingEquipmentConfig) {
        await updateEquipmentConfig(existingEquipmentConfig.id, recordData)
      } else {
        rowId = readWrittenRecordId(await createEquipmentConfig(recordData))
        if (!rowId) throw new Error('Could not resolve the saved equipment record.')
      }
      if (stagedShape) {
        await shapeUpload.upload({
          recordId: rowId,
          domain: EQUIPMENT_CONFIG_DOMAIN,
          field: 'shape_path',
          file: stagedShape.file,
          originalName: stagedShape.originalName,
          previousFileId: existingEquipmentConfig?.shape_path ?? null,
          metadataPrefix: 'shape',
          update: (id, patch) => updateEquipmentConfig(id, patch),
        })
        setStagedShape(null)
      }
      return 'Saved.'
    })
  }

  function handleUploadShape(file) {
    if (!file) return
    const name = dredgeFileName({
      project,
      kind: 'dredge-shape',
      dateISO: todayISO(),
      equipment,
      ext: fileExtension(file.name),
    })
    setStagedShape({ file: renameFile(file, name), originalName: file.name })
  }

  async function handleRemoveShape() {
    const fileId = existingEquipmentConfig?.shape_path
    if (!fileId) return
    const name = existingEquipmentConfig.shape_original_name || 'this dredge shape'
    if (!(await confirm(`Remove ${name}? The stored file will be deleted.`))) return
    await runRemove(async () => {
      await updateEquipmentConfig(existingEquipmentConfig.id, {
        shape_path: null,
        shape_original_name: null,
        shape_storage_path: null,
      })
      await deleteAttachment({ fileId, domain: EQUIPMENT_CONFIG_DOMAIN, coreRecordId: existingEquipmentConfig.id })
        .catch((err) => console.error('Could not delete the removed dredge shape:', err.message))
    })
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
        fileId={existingEquipmentConfig?.shape_path}
        fileName={existingEquipmentConfig?.shape_original_name}
        staged={stagedShape}
        onChange={handleUploadShape}
        onUnstage={() => setStagedShape(null)}
        onRemove={handleRemoveShape}
        removing={removing}
      />
      <Button size="xs" variant="default" loading={saving} onClick={handleSave}>Save</Button>
      {saveMsg && <Text size="xs" c="green">{saveMsg}</Text>}
      {saveError && <Text size="xs" c="red">{saveError}</Text>}
      {removeError && <Text size="xs" c="red">{removeError}</Text>}
    </Group>
  )
}
