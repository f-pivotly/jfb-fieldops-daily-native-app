import { useState } from 'react'
import { Box, Button, Checkbox, FileButton, Group, Stack, Text, TextInput } from '@mantine/core'
import { useSpreaderConfig } from '../../../hooks/useSpreaderConfig'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { readWrittenRecordId } from '../../../data'
import { useStagedFiles } from './hooks/useStagedFiles'

const SPREADER_CONFIG_DOMAIN = 'jfb_spreader_config'

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

function validateBoundaries(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new Error('Expected a non-empty array of subareas.')
  for (const b of raw) {
    if (!b || typeof b.area !== 'string' || !b.area) throw new Error('Every subarea needs an "area" name.')
    if (!Array.isArray(b.rings) || !b.rings.length) throw new Error(`Subarea "${b.area}" has no rings.`)
    for (const r of b.rings) {
      if (!Array.isArray(r) || r.length < 3) throw new Error(`Subarea "${b.area}" has a ring with fewer than 3 points.`)
    }
  }
  return raw
}

function validateLanes(raw) {
  if (!Array.isArray(raw)) throw new Error('Expected an array of lanes.')
  for (const l of raw) {
    if (!Array.isArray(l?.c0) || !Array.isArray(l?.c1) || typeof l?.w !== 'number') {
      throw new Error('Every lane needs c0, c1 and a numeric w.')
    }
  }
  return raw
}

export default function SpreaderChartTab({ project }) {
  const { config, loading, create, update } = useSpreaderConfig(project?.id)

  if (!project?.id) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Select a project to manage its spreader chart.</Text>
  }
  if (loading) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Loading spreader chart settings…</Text>
  }
  return (
    <SpreaderChartTabForm
      key={config?.id ?? 'new'}
      project={project}
      existingConfig={config}
      createConfig={create}
      updateConfig={update}
    />
  )
}

function SpreaderChartTabForm({ project, existingConfig, createConfig, updateConfig }) {
  const [spreaderName, setSpreaderName] = useState(existingConfig?.spreader_name ?? '')
  const [layerTitle, setLayerTitle] = useState(existingConfig?.layer_title ?? '')
  const [active, setActive] = useState(existingConfig ? existingConfig.active !== false : true)
  const [aerialGeoref, setAerialGeoref] = useState(() => georefToFields(existingConfig?.aerial_georef))
  const [boundaries, setBoundaries] = useState(existingConfig?.boundaries ?? null)
  const [lanes, setLanes] = useState(existingConfig?.planned_lanes ?? null)
  const [nums, setNums] = useState({
    plan_cell_len_ft: String(existingConfig?.plan_cell_len_ft ?? 6),
    broadcast_ft: String(existingConfig?.broadcast_ft ?? 10),
    min_step_tons: String(existingConfig?.min_step_tons ?? 2),
    forward_throw_ft: String(existingConfig?.forward_throw_ft ?? 28),
    cross_extra_ft: String(existingConfig?.cross_extra_ft ?? 0),
    transition_ft: String(existingConfig?.transition_ft ?? 8),
  })
  const [pickError, setPickError] = useState(null)

  const { stagedFiles, stageFile, flushFiles } = useStagedFiles()
  const { busy, message, error, run } = useAsyncAction()

  const setNum = (k, v) => setNums((n) => ({ ...n, [k]: v }))

  const pickJson = async (file, validate, apply) => {
    setPickError(null)
    try {
      apply(validate(JSON.parse(await file.text())))
    } catch (e) {
      setPickError(`${file.name}: ${e.message}`)
    }
  }

  const save = () =>
    run(async () => {
      const recordData = {
        project_id: project.id,
        spreader_name: spreaderName.trim() || null,
        layer_title: layerTitle.trim() || null,
        active,
        aerial_georef: fieldsToGeoref(aerialGeoref),
        boundaries,
        planned_lanes: lanes,
        ...Object.fromEntries(
          Object.entries(nums).map(([k, v]) => [k, v.trim() === '' ? null : Number(v)]),
        ),
      }
      let configId = existingConfig?.id ?? null
      if (configId) await updateConfig(configId, recordData)
      else configId = readWrittenRecordId(await createConfig(recordData))
      await flushFiles({
        recordId: configId,
        domain: SPREADER_CONFIG_DOMAIN,
        existing: existingConfig,
        update: (patch) => updateConfig(configId, patch),
      })
      return 'Spreader chart settings saved.'
    })

  const subareaSummary = boundaries?.length
    ? `${boundaries.length} subarea(s): ${boundaries.map((b) => b.area).join(', ')}`
    : 'None loaded — coverage cannot be derived without these.'

  return (
    <Stack gap={14}>
      <Group gap="md" align="flex-end">
        <TextInput label="Spreader name" size="xs" w={200} placeholder="e.g. Neenah"
          value={spreaderName} onChange={(e) => setSpreaderName(e.currentTarget.value)} />
        <TextInput label="Layer title" size="xs" w={160} placeholder="e.g. Layer 1"
          value={layerTitle} onChange={(e) => setLayerTitle(e.currentTarget.value)} />
        <Checkbox label="Active" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />
      </Group>

      <Box>
        <Text fw={600} size="sm">Subarea boundaries</Text>
        <Text size="xs" c="dimmed" mb={6}>
          JSON: <code>[{'{'}&quot;area&quot;:&quot;IFN&quot;,&quot;rings&quot;:[[[x,y],…]]{'}'}]</code>.
          Coverage is hard-clipped to these, so placement is never charted outside the footprint.
        </Text>
        <Group gap={10}>
          <FileButton onChange={(f) => f && pickJson(f, validateBoundaries, setBoundaries)} accept="application/json,.json">
            {(props) => <Button {...props} size="xs" variant="default">Load boundaries JSON</Button>}
          </FileButton>
          <Text size="xs" c={boundaries?.length ? 'dimmed' : 'orange.8'}>{subareaSummary}</Text>
        </Group>
      </Box>

      <Box>
        <Text fw={600} size="sm">Lane plan (optional)</Text>
        <Text size="xs" c="dimmed" mb={6}>
          JSON: <code>[{'{'}&quot;c0&quot;:[x,y],&quot;c1&quot;:[x,y],&quot;w&quot;:35{'}'}]</code>.
          With a plan loaded, coverage snaps to the planned lanes so the chart reads like the PM&apos;s
          hand drawing; without one it falls back to the directional model.
        </Text>
        <Group gap={10}>
          <FileButton onChange={(f) => f && pickJson(f, validateLanes, setLanes)} accept="application/json,.json">
            {(props) => <Button {...props} size="xs" variant="default">Load lane plan JSON</Button>}
          </FileButton>
          <Text size="xs" c="dimmed">
            {lanes?.length ? `${lanes.length} lane(s) loaded` : 'None — directional model will be used.'}
          </Text>
        </Group>
      </Box>

      <Box>
        <Text fw={600} size="sm">Aerial</Text>
        <Group gap={10} mt={6} align="center">
          <FileButton onChange={(f) => f && stageFile('aerial_path', f)} accept="image/*">
            {(props) => <Button {...props} size="xs" variant="default">Choose aerial image</Button>}
          </FileButton>
          {stagedFiles.aerial_path && <Text size="xs" c="orange">Staged — will upload on Save</Text>}
          {existingConfig?.aerial_original_name && !stagedFiles.aerial_path && (
            <Text size="xs" c="dimmed">{existingConfig.aerial_original_name}</Text>
          )}
        </Group>
        <Group gap="xs" mt={8}>
          <TextInput label="West X" size="xs" w={130} value={aerialGeoref.westX}
            onChange={(e) => setAerialGeoref((g) => ({ ...g, westX: e.currentTarget.value }))} />
          <TextInput label="East X" size="xs" w={130} value={aerialGeoref.eastX}
            onChange={(e) => setAerialGeoref((g) => ({ ...g, eastX: e.currentTarget.value }))} />
          <TextInput label="North Y" size="xs" w={130} value={aerialGeoref.northY}
            onChange={(e) => setAerialGeoref((g) => ({ ...g, northY: e.currentTarget.value }))} />
          <TextInput label="South Y" size="xs" w={130} value={aerialGeoref.southY}
            onChange={(e) => setAerialGeoref((g) => ({ ...g, southY: e.currentTarget.value }))} />
        </Group>
      </Box>

      <Box>
        <Text fw={600} size="sm" mb={6}>Coverage tuning</Text>
        <Group gap="xs">
          <TextInput label="Min step tons" size="xs" type="number" w={130}
            value={nums.min_step_tons} onChange={(e) => setNum('min_step_tons', e.currentTarget.value)} />
          <TextInput label="Forward throw ft" size="xs" type="number" w={140}
            value={nums.forward_throw_ft} onChange={(e) => setNum('forward_throw_ft', e.currentTarget.value)} />
          <TextInput label="Cross extra ft" size="xs" type="number" w={130}
            value={nums.cross_extra_ft} onChange={(e) => setNum('cross_extra_ft', e.currentTarget.value)} />
          <TextInput label="Transition ft" size="xs" type="number" w={130}
            value={nums.transition_ft} onChange={(e) => setNum('transition_ft', e.currentTarget.value)} />
          <TextInput label="Plan cell len ft" size="xs" type="number" w={140}
            value={nums.plan_cell_len_ft} onChange={(e) => setNum('plan_cell_len_ft', e.currentTarget.value)} />
          <TextInput label="Broadcast ft" size="xs" type="number" w={130}
            value={nums.broadcast_ft} onChange={(e) => setNum('broadcast_ft', e.currentTarget.value)} />
        </Group>
        <Text size="xs" c="dimmed" mt={6}>
          Min step tons filters out walk-back moves the spreader logs at near-zero tonnage.
        </Text>
      </Box>

      <Group>
        <Button size="xs" loading={busy} onClick={save} style={{ background: '#0F2744', border: 'none' }}>
          Save spreader chart settings
        </Button>
        {message && <Text size="xs" c="teal">{typeof message === 'string' ? message : 'Saved.'}</Text>}
        {(error || pickError) && <Text size="xs" c="red">{error || pickError}</Text>}
      </Group>
    </Stack>
  )
}
