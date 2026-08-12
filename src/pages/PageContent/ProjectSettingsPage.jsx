import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Text, Group, Tabs, Table, TextInput, Button, SimpleGrid, Stack } from '@mantine/core'
import { findProject } from '../../data/dashboardSampleData'
import {
  SAMPLE_PRODUCTION_PLAN,
  SAMPLE_SCHEDULED_OFF_DAYS,
  SAMPLE_NARRATIVE_SECTION_CONFIG,
  SAMPLE_METRICS_CONFIG,
  SAMPLE_SITE_EQUIPMENT,
  SAMPLE_ATTACHMENTS,
  SAMPLE_DREDGE_CHART_CONFIG,
} from '../../data/projectSettingsSampleData'

// apg-jfbo-project-settings. Sample-mode stand-in for
// jfb-fieldops-daily/src/pages/ProjectSettingsPage.tsx.
export default function ProjectSettingsPage() {
  const { projectId } = useParams()
  const project = findProject(projectId)
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
              rows={SAMPLE_NARRATIVE_SECTION_CONFIG}
              columns={[['label', 'Section'], ['sortOrder', 'Order']]}
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
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Stat label="Configured" value={SAMPLE_DREDGE_CHART_CONFIG.configured ? 'Yes' : 'No'} />
              <Stat label="Cell grid" value={SAMPLE_DREDGE_CHART_CONFIG.cellGrid} />
              <Stat label="Last HYPACK upload" value={SAMPLE_DREDGE_CHART_CONFIG.lastHypackUpload} />
            </SimpleGrid>
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
