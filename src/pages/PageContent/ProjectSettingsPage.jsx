import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Text, Group, Tabs, Table, TextInput, Button, SimpleGrid, Stack, Select, NumberInput, Slider, FileButton } from '@mantine/core'
import { IconUpload, IconTrash, IconPlus, IconChartAreaLine } from '@tabler/icons-react'
import { useProject } from '../../hooks/useProject'
import { useDomainData } from '../../hooks/useDomainData'
import {
  SAMPLE_PRODUCTION_PLAN,
  SAMPLE_SCHEDULED_OFF_DAYS,
  SAMPLE_METRICS_CONFIG,
  SAMPLE_SITE_EQUIPMENT,
  SAMPLE_ATTACHMENTS,
  SAMPLE_DREDGE_CHART_CONFIG,
  SAMPLE_DREDGE_EXCLUSION_AREAS,
  SAMPLE_HYPACK_UPLOADS,
} from '../../data/projectSettingsSampleData'

export default function ProjectSettingsPage() {
  const { projectId } = useParams()
  const { project } = useProject(projectId)
  const { records: narrativeRows } = useDomainData({ domain: 'jfb_project_report_narratives', system: 'core', projectId })
  const sortedNarrativeRows = [...narrativeRows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const plan = SAMPLE_PRODUCTION_PLAN

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={1000} mx="auto">
        <Link to={`/projects/${projectId}/reports`} style={{ fontSize: 12 }}>← Project Dashboard</Link>

        <Text fw={700} size="lg" mt={10}>Project Settings · {project?.name ?? ''}</Text>
        <Text size="xs" c="dimmed" mb={16}>Project #{project?.project_code}</Text>

        <Box p={16} mb={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
          <Text fw={600} size="sm" mb={2}>Production plan (Realized To-Date forecast)</Text>
          <Text size="xs" c="dimmed" mb={10}>
            Bid goal rate ({plan.bidGoalRate} {plan.primaryMeasure}/GOH) × expected GOH/day = anticipated daily production.
          </Text>
          <Group align="flex-end" gap="md">
            <TextInput label="Expected GOH/day" size="xs" defaultValue={plan.expectedGohPerDay} w={120} />
            <TextInput label="Production days/week" size="xs" defaultValue={plan.productionDaysPerWeek} w={140} />
            <TextInput label="Production start date" size="xs" type="date" defaultValue={plan.productionStartDate} w={160} />
            <Button size="xs">Save plan</Button>
          </Group>
        </Box>

        <Box p={16} mb={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
          <Text fw={600} size="sm" mb={8}>Scheduled Off-Days</Text>
          <Stack gap={4}>
            {SAMPLE_SCHEDULED_OFF_DAYS.map((d) => (
              <Group key={d.date} justify="space-between">
                <Text size="sm">{d.date}</Text>
                <Text size="xs" c="dimmed">{d.reason}</Text>
              </Group>
            ))}
          </Stack>
        </Box>

        <Tabs defaultValue="narratives">
          <Tabs.List mb={12}>
            <Tabs.Tab value="narratives">Narratives</Tabs.Tab>
            <Tabs.Tab value="metrics">Cover Metrics</Tabs.Tab>
            <Tabs.Tab value="siteEquipment">Site Equipment</Tabs.Tab>
            <Tabs.Tab value="attachments">Attachments</Tabs.Tab>
            <Tabs.Tab value="dredgeChart">Dredge Chart</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="narratives">
            <ConfigTable
              rows={sortedNarrativeRows}
              columns={[['narrative_label', 'Section'], ['sort_order', 'Order']]}
            />
          </Tabs.Panel>
          <Tabs.Panel value="metrics">
            <ConfigTable
              rows={SAMPLE_METRICS_CONFIG}
              columns={[['label', 'Metric'], ['source', 'Source'], ['unit', 'Unit'], ['sortOrder', 'Order']]}
            />
          </Tabs.Panel>
          <Tabs.Panel value="siteEquipment">
            <ConfigTable
              rows={SAMPLE_SITE_EQUIPMENT}
              columns={[['name', 'Equipment'], ['mobilized', 'Mobilized'], ['demobilized', 'Demobilized']]}
            />
          </Tabs.Panel>
          <Tabs.Panel value="attachments">
            <ConfigTable
              rows={SAMPLE_ATTACHMENTS}
              columns={[['name', 'File'], ['uploadedAt', 'Uploaded']]}
            />
          </Tabs.Panel>
          <Tabs.Panel value="dredgeChart">
            <DredgeChartSettings />
          </Tabs.Panel>
        </Tabs>
      </Box>
    </ScrollArea>
  )
}

function ConfigTable({ rows, columns }) {
  return (
    <Table withTableBorder verticalSpacing="xs" fz="sm">
      <Table.Thead>
        <Table.Tr>
          {columns.map(([, label]) => <Table.Th key={label}>{label}</Table.Th>)}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r, i) => (
          <Table.Tr key={r.id ?? r.key ?? i}>
            {columns.map(([field, label]) => <Table.Td key={label}>{String(r[field] ?? '—')}</Table.Td>)}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

function Stat({ label, value }) {
  return (
    <Box>
      <Text size="10px" tt="uppercase" c="dimmed">{label}</Text>
      <Text size="sm" fw={600}>{value}</Text>
    </Box>
  )
}

function DredgeChartSettings() {
  const cfg = SAMPLE_DREDGE_CHART_CONFIG
  const [chartStyle, setChartStyle] = useState(cfg.chartStyle)
  const [overlapTolerance, setOverlapTolerance] = useState(cfg.overlapToleranceFt)
  const [gapWidth, setGapWidth] = useState(cfg.gapWidth)
  const [baseImageUrl, setBaseImageUrl] = useState(null)
  const [exclusions, setExclusions] = useState(SAMPLE_DREDGE_EXCLUSION_AREAS)
  const [newExclusion, setNewExclusion] = useState('')
  const [uploads, setUploads] = useState(SAMPLE_HYPACK_UPLOADS)

  function handleBaseImage(file) {
    if (!file) return
    setBaseImageUrl(URL.createObjectURL(file))
  }

  function addExclusion() {
    if (!newExclusion.trim()) return
    setExclusions((prev) => [...prev, { id: `excl-${Date.now()}`, name: newExclusion.trim() }])
    setNewExclusion('')
  }
  function removeExclusion(id) {
    setExclusions((prev) => prev.filter((e) => e.id !== id))
  }

  function handleHypackUpload(file) {
    if (!file) return
    setUploads((prev) => [{ id: `up-${Date.now()}`, name: file.name, uploadedAt: 'just now' }, ...prev])
  }

  return (
    <Box>
      <SimpleGrid cols={{ base: 1, sm: 3 }} mb={16}>
        <Stat label="Configured" value={cfg.configured ? 'Yes' : 'No'} />
        <Stat label="Cell grid" value={cfg.cellGrid} />
        <Stat label="Last HYPACK upload" value={uploads[0]?.uploadedAt ?? '—'} />
      </SimpleGrid>

      <Box p={16} mb={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
        <Text fw={600} size="sm" mb={10}>Chart configuration</Text>
        <Group grow mb={12} align="flex-end">
          <Select
            label="Chart style"
            size="xs"
            data={[{ value: 'isopach', label: 'Isopach (default)' }, { value: 'csc', label: 'CSC cell breakdown' }]}
            value={chartStyle}
            onChange={(v) => setChartStyle(v ?? 'isopach')}
          />
          <NumberInput label="Overlap tolerance (ft)" size="xs" hideControls value={overlapTolerance} onChange={setOverlapTolerance} />
        </Group>
        <Text size="xs" c="dimmed" mb={4}>2nd-pass overlap gap width: {gapWidth}</Text>
        <Slider min={0} max={30} value={gapWidth} onChange={setGapWidth} mb={16} />

        <Text size="xs" c="dimmed" mb={6}>Base imagery</Text>
        {baseImageUrl ? (
          <Box mb={8} style={{ width: 200, height: 120, backgroundImage: `url(${baseImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 6 }} />
        ) : (
          <Box mb={8} style={{ width: 200, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--mantine-color-gray-0)', borderRadius: 6 }}>
            <IconChartAreaLine size={24} color="var(--mantine-color-gray-5)" />
          </Box>
        )}
        <FileButton onChange={handleBaseImage} accept="image/png,image/jpeg">
          {(props) => <Button {...props} size="xs" variant="default" leftSection={<IconUpload size={12} />}>Upload base imagery</Button>}
        </FileButton>
      </Box>

      <Box p={16} mb={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
        <Text fw={600} size="sm" mb={10}>Exclusion areas</Text>
        <Stack gap={6} mb={10}>
          {exclusions.map((e) => (
            <Group key={e.id} justify="space-between" p={8} style={{ background: '#f5f6f8', border: '1px solid #ebebeb', borderRadius: 6 }}>
              <Text size="xs">{e.name}</Text>
              <Box onClick={() => removeExclusion(e.id)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }}>
                <IconTrash size={13} />
              </Box>
            </Group>
          ))}
        </Stack>
        <Group gap={8}>
          <TextInput size="xs" placeholder="e.g. Dock pilings — NE corner" value={newExclusion} onChange={(e) => setNewExclusion(e.currentTarget.value)} style={{ flex: 1 }} />
          <Button size="xs" leftSection={<IconPlus size={11} />} onClick={addExclusion} disabled={!newExclusion.trim()} style={{ background: '#0F2744', border: 'none' }}>Add</Button>
        </Group>
      </Box>

      <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
        <Group justify="space-between" mb={10}>
          <Text fw={600} size="sm">HYPACK uploads</Text>
          <FileButton onChange={handleHypackUpload}>
            {(props) => <Button {...props} size="xs" leftSection={<IconUpload size={12} />} style={{ background: '#0F2744', border: 'none' }}>Upload .RAW</Button>}
          </FileButton>
        </Group>
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr><Table.Th>File</Table.Th><Table.Th>Uploaded</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {uploads.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>{u.name}</Table.Td>
                <Table.Td>{u.uploadedAt}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </Box>
  )
}
