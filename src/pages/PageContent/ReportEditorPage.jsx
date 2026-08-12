import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Grid, Text, Badge, Checkbox, Stack, Button, Tabs } from '@mantine/core'
import { REPORT_STATUS_LABEL, REPORT_STATUS_COLOR } from '../../data/dashboardSampleData'
import { SAMPLE_EQUIPMENT, SAMPLE_CHECKLIST } from '../../data/reportEditorSampleData'
import { useProject } from '../../hooks/useProject'
import EventLogTab from './reportEditorTabs/EventLogTab'
import ProductionStatsTab from './reportEditorTabs/ProductionStatsTab'
import PhotosTab from './reportEditorTabs/PhotosTab'
import NarrativesTab from './reportEditorTabs/NarrativesTab'
import MetricsTab from './reportEditorTabs/MetricsTab'
import SafetyTab from './reportEditorTabs/SafetyTab'
import DredgeProgressTab from './reportEditorTabs/DredgeProgressTab'
import PlacementProgressTab from './reportEditorTabs/PlacementProgressTab'
import WaterQualityTab from './reportEditorTabs/WaterQualityTab'
import AirQualityTab from './reportEditorTabs/AirQualityTab'

const CONTENT_TABS = [
  { key: 'event_log', label: 'Event Log', Comp: EventLogTab },
  { key: 'production', label: 'Production Stats', Comp: ProductionStatsTab },
  { key: 'photos', label: 'Photos', Comp: PhotosTab },
  { key: 'narratives', label: 'Narratives', Comp: NarrativesTab },
  { key: 'metrics', label: 'Metrics', Comp: MetricsTab },
  { key: 'safety', label: 'Safety', Comp: SafetyTab },
  { key: 'dredge_progress', label: 'Dredge Progress', Comp: DredgeProgressTab },
  { key: 'placement_progress', label: 'Placement Progress', Comp: PlacementProgressTab },
  { key: 'water_quality', label: 'Water Quality', Comp: WaterQualityTab },
  { key: 'air_quality', label: 'Air Quality', Comp: AirQualityTab },
]

const CHECKLIST_LABELS = {
  event_log_reviewed: 'Event log reviewed',
  transitions_added: 'Transition events added',
  production_stats_entered: 'Production stats entered',
  photos_complete: 'Photos uploaded and labeled',
  narratives_complete: 'Narratives complete',
  metrics_entered: 'Metrics entered',
}

export default function ReportEditorPage() {
  const { projectId, date } = useParams()
  const { project } = useProject(projectId)
  const [status] = useState('cqc_review')
  const [mobDay, setMobDay] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState(SAMPLE_EQUIPMENT[0].id)
  const [tab, setTab] = useState('event_log')

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={1200} mx="auto">
        <Link to={`/projects/${projectId}/reports`} style={{ fontSize: 12 }}>← Report list</Link>

        <Grid mt={10} gutter="lg">
          <Grid.Col span={{ base: 12, lg: 3 }}>
            <Stack gap="md" p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
              <Box>
                <Text fw={700} size="md">{date}</Text>
                {project && <Text size="xs" c="dimmed">{project.name} · #{project.project_code}</Text>}
              </Box>

              <Box style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text size="xs" tt="uppercase" c="dimmed">Status</Text>
                <Badge size="sm" color={REPORT_STATUS_COLOR[status]}>{REPORT_STATUS_LABEL[status]}</Badge>
              </Box>

              <Checkbox
                size="xs"
                label="Mobilization day (no production)"
                checked={mobDay}
                onChange={(e) => setMobDay(e.currentTarget.checked)}
              />

              <Box>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>Completion</Text>
                <Stack gap={6}>
                  {Object.entries(CHECKLIST_LABELS).map(([key, label]) => (
                    <Checkbox key={key} size="xs" readOnly label={label} checked={SAMPLE_CHECKLIST[key]} />
                  ))}
                </Stack>
              </Box>

              <Box>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>Equipment</Text>
                <Stack gap={4}>
                  {SAMPLE_EQUIPMENT.map((eq) => (
                    <Button
                      key={eq.id}
                      size="xs"
                      variant={selectedEquipment === eq.id ? 'filled' : 'default'}
                      justify="flex-start"
                      onClick={() => setSelectedEquipment(eq.id)}
                    >
                      {eq.name}
                    </Button>
                  ))}
                </Stack>
              </Box>

              <Box pt={8} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>PM review</Text>
                <Stack gap={4}>
                  <Button size="xs" color="green">Approve</Button>
                  <Button size="xs" variant="default">Send back to PE</Button>
                </Stack>
              </Box>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 9 }}>
            <Tabs value={tab} onChange={setTab} keepMounted={false}>
              <Tabs.List mb={12}>
                {CONTENT_TABS.map((t) => (
                  <Tabs.Tab key={t.key} value={t.key}>{t.label}</Tabs.Tab>
                ))}
              </Tabs.List>
              {CONTENT_TABS.map((t) => (
                <Tabs.Panel key={t.key} value={t.key}>
                  <t.Comp />
                </Tabs.Panel>
              ))}
            </Tabs>
          </Grid.Col>
        </Grid>
      </Box>
    </ScrollArea>
  )
}
