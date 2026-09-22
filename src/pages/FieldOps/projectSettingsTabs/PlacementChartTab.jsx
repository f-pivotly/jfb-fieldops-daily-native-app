import { useRef, useState } from 'react'
import { Box, Button, Checkbox, FileButton, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { usePlacementConfig } from '../../../hooks/placement/usePlacementConfig'
import { useProjectLayers } from '../../../hooks/capping/useProjectLayers'
import { useAsyncAction, warn } from '../../../hooks/ui/useAsyncAction'
import { uploadWarning } from '../../../hooks/ui/uploadWarning'
import { readWrittenRecordId } from '../../../data'
import { loadAttachmentImage, loadPublicImage } from '../../../lib/dredge/imageLoaders'
import { prepareGrid, validatePlacementGrid } from '../../../lib/placement/grid'
import { buildLiftPalette, renderPlacementChart } from '../../../lib/placement/chart'
import { loadDesignExtents, loadPlacementGrid, loadPlacementReferenceLines } from '../../../lib/placement/loaders'
import { useStagedFiles } from '../../../hooks/ui/useStagedFiles'

const PLACEMENT_CONFIG_DOMAIN = 'jfb_placement_config'

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

export default function PlacementChartTab({ project }) {
  const { config, loading, create, update } = usePlacementConfig(project?.id)

  if (!project?.id) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Select a project to manage its placement chart.</Text>
  }
  if (loading) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Loading placement chart settings…</Text>
  }
  return (
    <PlacementChartTabForm
      key={config?.id ?? 'new'}
      project={project}
      existingConfig={config}
      createConfig={create}
      updateConfig={update}
    />
  )
}

function PlacementChartTabForm({ project, existingConfig, createConfig, updateConfig }) {
  const { layers } = useProjectLayers(project.id)
  const [label, setLabel] = useState(existingConfig?.label ?? '')
  const [active, setActive] = useState(existingConfig ? existingConfig.active !== false : true)
  const [aerialGeoref, setAerialGeoref] = useState(() => georefToFields(existingConfig?.aerial_georef))
  const [chartFraming, setChartFraming] = useState(existingConfig?.chart_framing ?? 'site')
  const [gridSummary, setGridSummary] = useState(null)
  const [previewGenerated, setPreviewGenerated] = useState(false)
  const previewCanvasRef = useRef(null)
  const previewGridRef = useRef(null)
  const previewLinesRef = useRef(null)
  const previewExtentsRef = useRef(null)

  const { busy: saving, message: saveMsg, warning: saveWarning, error: saveError, run: runSave } = useAsyncAction()
  const { busy: gridBusy, error: gridError, run: runGrid } = useAsyncAction()
  const { busy: previewBusy, message: previewMsg, error: previewError, run: runPreview, markError: markPreviewError } = useAsyncAction()

  const { stagedFiles, stageFile, flushFiles } = useStagedFiles()

  async function handleGridFile(file) {
    if (!file) return
    setGridSummary(null)
    await runGrid(async () => {
      const parsed = validatePlacementGrid(JSON.parse(await file.text()))
      const prepared = prepareGrid(parsed)
      setGridSummary({
        label: parsed.label,
        cells: prepared.cellCount,
        sqFt: prepared.totalSqFt,
        cellFt: parsed.cellFt,
        rotationDeg: parsed.rotationDeg,
        boundary: parsed.boundary ? parsed.boundary.length : 0,
        partials: parsed.partials ? Object.keys(parsed.partials).length : 0,
      })
      stageFile('grid_path', file)
      return 'ok'
    })
  }

  async function handleSave() {
    await runSave(async () => {
      const recordData = {
        project_id: project.id,
        label: label.trim() || null,
        aerial_georef: fieldsToGeoref(aerialGeoref),
        chart_framing: chartFraming === 'work' ? 'work' : null,
        active,
      }
      let configId = existingConfig?.id ?? null
      if (existingConfig) {
        await updateConfig(existingConfig.id, recordData)
      } else {
        configId = readWrittenRecordId(await createConfig(recordData))
        if (!configId) throw new Error('Could not resolve the saved config record.')
      }
      const { failedUploads } = await flushFiles({
        recordId: configId,
        domain: PLACEMENT_CONFIG_DOMAIN,
        existing: existingConfig,
        update: (patch) => updateConfig(configId, patch),
      })
      if (failedUploads.length) return warn(uploadWarning(failedUploads))
      return 'Saved.'
    })
  }

  async function generatePreview() {
    if (!existingConfig?.grid_path) {
      markPreviewError('Upload the bucket grid and click Save first, then preview.')
      return
    }
    setPreviewGenerated(false)
    await runPreview(async () => {
      const [grid, referenceLines, designExtents, aerialImage, logoImage, northImage] = await Promise.all([
        loadPlacementGrid(existingConfig.grid_path, previewGridRef),
        loadPlacementReferenceLines(existingConfig.reference_lines_path, previewLinesRef),
        loadDesignExtents(existingConfig.design_extents_path, previewExtentsRef),
        loadAttachmentImage(existingConfig.aerial_path),
        loadPublicImage('/dredge/_assets/logo.jpg'),
        loadPublicImage('/dredge/_assets/north.png'),
      ])
      const palette = buildLiftPalette(layers)
      renderPlacementChart(previewCanvasRef.current, {
        grid,
        cellFills: new Map(),
        passes: { firstPassCells: 0, secondPassCells: 0, firstPassSqFt: 0, secondPassSqFt: 0, byLift: [] },
        referenceLines,
        designExtents,
        framing: existingConfig.chart_framing ?? null,
        dateISO: new Date().toISOString().slice(0, 10),
        projectTitle: `${project.name} (SETUP PREVIEW)`,
        equipmentLabel: 'Setup preview',
        areaLabel: existingConfig.label || 'Work area',
        aerialImage,
        aerialGeoref: existingConfig.aerial_georef ?? null,
        logoImage,
        northImage,
        legend: palette.legend,
        legendComplete: palette.legendComplete,
        materials: [],
      })
      setPreviewGenerated(true)
      return `Preview generated — ${grid.cellCount.toLocaleString()} grid cells, ${Math.round(grid.totalSqFt).toLocaleString()} SF.`
        + (aerialImage ? '' : ' No aerial loaded, so the chart shows the grid on the flat map colour.')
    })
  }

  function downloadPreviewPng() {
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = 'placement-chart-preview.png'
    a.click()
  }

  return (
    <Stack gap="lg">
      <Section
        title="Bucket grid & labels"
        help="The bucket grid is the accounting unit for placement coverage: every bucket in the day's .bkt file is indexed onto it, and a touched cell counts as its FULL area. Without a grid the Placement Progress tab stays hidden."
      >
        <Group grow align="flex-start">
          <Field label="Work-area label (chart header)" help="Printed on the chart's Area line, e.g. &quot;Area A - New Breakwater&quot;.">
            <TextInput value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
          </Field>
        </Group>

        <Field
          label="Bucket grid lattice (JSON)"
          help="rotationDeg + originU/originV + cellFt + the [col,row] cells that exist, plus an optional boundary polyline and optional clipped-edge partials. Derived once from the project's bucket-grid CAD drawing; the file is checked as soon as you pick it."
        >
          <FileControl
            accept=".json,application/json"
            uploading={gridBusy}
            uploaded={!!existingConfig?.grid_path}
            staged={!!stagedFiles.grid_path}
            error={gridError}
            onChange={handleGridFile}
          />
          {existingConfig?.grid_original_name && !stagedFiles.grid_path && (
            <Text size="10px" c="dimmed" mt={2}>Uploaded: {existingConfig.grid_original_name}</Text>
          )}
          {gridSummary && (
            <Text size="10px" c="teal" mt={2}>
              Read “{gridSummary.label}” — {gridSummary.cells.toLocaleString()} cells,{' '}
              {Math.round(gridSummary.sqFt).toLocaleString()} SF at {gridSummary.cellFt} × {gridSummary.cellFt} ft,
              rotated {gridSummary.rotationDeg.toFixed(2)}°
              {gridSummary.boundary ? `, ${gridSummary.boundary}-point work boundary` : ', no work boundary'}
              {gridSummary.partials ? `, ${gridSummary.partials} clipped edge cells` : ''} — click Save to apply.
            </Text>
          )}
        </Field>

        <Field
          label="Alignment / stationing overlay (optional)"
          help="Open line work plus text labels, drawn as a thin reference overlay over the map. Purely visual; not used in any calculation. A DXF is read directly; a pre-extracted JSON of {segments, labels} may also carry an `emphasis` array for structures such as a sheet pile wall, which draw heavier and in a warm red so they do not read as just another boundary."
        >
          <FileControl
            accept=".dxf,application/dxf,.json,application/json"
            uploaded={!!existingConfig?.reference_lines_path}
            staged={!!stagedFiles.reference_lines_path}
            onChange={(file) => file && stageFile('reference_lines_path', file)}
          />
        </Field>

        <Field
          label="Design extents (optional, JSON rings)"
          help="The design region the work is being placed into, drawn as a pale filled area with a dashed outline UNDER the coverage, so the day's progress reads against what the design calls for. Also adds a Stability Backfill Extents swatch to the legend."
        >
          <FileControl
            accept=".json,application/json"
            uploaded={!!existingConfig?.design_extents_path}
            staged={!!stagedFiles.design_extents_path}
            onChange={(file) => file && stageFile('design_extents_path', file)}
          />
          {existingConfig?.design_extents_original_name && !stagedFiles.design_extents_path && (
            <Text size="10px" c="dimmed" mt={2}>Uploaded: {existingConfig.design_extents_original_name}</Text>
          )}
        </Field>

        <Field
          label="Plant outline (optional, JSON)"
          help="Barge / machine footprint drawn on the chart for scale and orientation."
        >
          <FileControl
            accept=".json,application/json"
            uploaded={!!existingConfig?.plant_path}
            staged={!!stagedFiles.plant_path}
            onChange={(file) => file && stageFile('plant_path', file)}
          />
          {existingConfig?.plant_original_name && !stagedFiles.plant_path && (
            <Text size="10px" c="dimmed" mt={2}>Uploaded: {existingConfig.plant_original_name}</Text>
          )}
        </Field>

        <Field
          label="Chart framing"
          help="Site shows the whole grid (or the aerial when georeferenced). Work crops to the design region plus the day's coverage, so the frame follows the job as later layers spread past the design extents."
        >
          <Select
            size="xs"
            value={chartFraming === 'work' ? 'work' : 'site'}
            onChange={(v) => setChartFraming(v ?? 'site')}
            data={[
              { value: 'site', label: 'Site — the whole work area' },
              { value: 'work', label: "Work — crop to the design region + today's coverage" },
            ]}
            allowDeselect={false}
            style={{ maxWidth: 420 }}
          />
        </Field>

        <Box p={12} style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 6, background: 'var(--mantine-color-gray-0)' }}>
          <Stack gap={10}>
            <Text size="xs" fw={600}>Aerial base layer (optional) — drawn behind the grid for context.</Text>
            <Field label="Aerial image (PNG/JPG, clipped to the work area)">
              <FileControl
                accept="image/png,image/jpeg,image/webp"
                uploaded={!!existingConfig?.aerial_path}
                staged={!!stagedFiles.aerial_path}
                onChange={(file) => file && stageFile('aerial_path', file)}
              />
            </Field>
            <Text size="xs" c="dimmed">
              Aerial georeference — the world coordinates (project CRS, ft) of the aerial&apos;s corners. When set,
              these also frame the chart view, so the imagery fills the map panel exactly.
            </Text>
            <GeoreferenceGrid value={aerialGeoref} onChange={setAerialGeoref} />
          </Stack>
        </Box>

        <Checkbox
          label="Placement charting active"
          description="Uncheck to hide the Placement Progress tab without deleting the uploaded grid and aerial."
          checked={active}
          onChange={(e) => setActive(e.currentTarget.checked)}
        />

        <Group>
          <Button size="xs" loading={saving} onClick={handleSave} style={{ background: '#0F2744', border: 'none' }}>
            Save placement chart settings
          </Button>
          {saveMsg && <Text size="xs" c="green">{saveMsg}</Text>}
          {saveWarning && <Text size="xs" c="#b45309">{saveWarning}</Text>}
          {saveError && <Text size="xs" c="red">{saveError}</Text>}
        </Group>
      </Section>

      <Section
        title="Lift colours"
        help="Earlier days on the cumulative chart are coloured by the material placed there. Layers whose names match a known stone class collapse onto that class, so several lifts of the same stone share one swatch. Set a layer's chart colour in Admin -> Capping Setup to switch this project to the pass-split scheme instead, where earlier days collapse to one Progress To Date colour."
      >
        {(layers ?? []).length === 0 ? (
          <Text size="xs" c="dimmed">
            No layers configured on this project yet. Until there are, a day&apos;s coverage still charts in
            Daily Progress green but earlier days cannot take a lift colour.
          </Text>
        ) : (
          <Group gap={10} wrap="wrap">
            {buildLiftPalette(layers).entries.map((e) => (
              <Group key={e.key} gap={6} wrap="nowrap">
                <Box w={26} h={16} style={{ background: e.color, border: '1px solid #000' }} />
                <Text size="xs">{e.label}</Text>
              </Group>
            ))}
          </Group>
        )}
      </Section>

      <Section
        title="Preview chart"
        help="Dry-run the chart from the saved settings above — grid, aerial, georeference, labels and legend — before the crew's first real bucket file. Save your changes first."
      >
        <Group>
          <Button size="xs" loading={previewBusy} onClick={generatePreview} style={{ background: '#0F2744', border: 'none' }}>
            Preview chart
          </Button>
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

function FileControl({ accept, label, onChange, uploading, uploaded, staged, error }) {
  return (
    <Box>
      {label && <Text size="xs" c="dimmed" mb={4}>{label}</Text>}
      <Group gap={8} align="center">
        <FileButton onChange={onChange ?? (() => {})} accept={accept}>
          {(props) => <Button {...props} variant="default" size="xs" loading={uploading}>Choose File</Button>}
        </FileButton>
        {uploaded && !uploading && !staged && <Text size="xs" c="teal">Uploaded</Text>}
        {staged && !uploading && <Text size="xs" c="orange">Staged — will upload on Save</Text>}
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
