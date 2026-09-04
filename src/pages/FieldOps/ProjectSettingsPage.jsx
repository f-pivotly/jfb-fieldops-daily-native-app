import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Text, Group, Tabs, TextInput, Button, Stack } from '@mantine/core'
import { useProject } from '../../hooks/useProject'
import { shouldShowDredgeProgress } from '../../config/dredgeProgress'
import NarrativesTab from '../Admin/ProjectDetail/NarrativesTab'
import DredgeChartTab from './projectSettingsTabs/DredgeChartTab'
import AttachmentsTab from './projectSettingsTabs/AttachmentsTab'
import SiteEquipmentTab from './projectSettingsTabs/SiteEquipmentTab'
import CoverMetricsTab from './projectSettingsTabs/CoverMetricsTab'

const PRODUCTION_PLAN_PLACEHOLDER = {
  expectedGohPerDay: '',
  productionDaysPerWeek: '',
  productionStartDate: '',
  bidGoalRate: '',
  primaryMeasure: '',
}
const SCHEDULED_OFF_DAYS_PLACEHOLDER = []

export default function ProjectSettingsPage() {
  const { projectId } = useParams()
  const { project } = useProject(projectId)
  const plan = PRODUCTION_PLAN_PLACEHOLDER
  const isDredging = shouldShowDredgeProgress(project)

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
            {SCHEDULED_OFF_DAYS_PLACEHOLDER.map((d) => (
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
            {isDredging && <Tabs.Tab value="dredgeChart">Dredge Chart</Tabs.Tab>}
          </Tabs.List>

          <Tabs.Panel value="narratives">
            <NarrativesTab project={project} />
          </Tabs.Panel>
          <Tabs.Panel value="metrics">
            <CoverMetricsTab project={project} />
          </Tabs.Panel>
          <Tabs.Panel value="siteEquipment">
            <SiteEquipmentTab project={project} />
          </Tabs.Panel>
          <Tabs.Panel value="attachments">
            <AttachmentsTab project={project} />
          </Tabs.Panel>
          {isDredging && (
            <Tabs.Panel value="dredgeChart">
              <DredgeChartTab project={project} />
            </Tabs.Panel>
          )}
        </Tabs>
      </Box>
    </ScrollArea>
  )
}

