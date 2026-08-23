import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Grid, Text, Badge, Checkbox, Stack, Button, Tabs } from '@mantine/core'
import { REPORT_STATUS_LABEL, REPORT_STATUS_COLOR } from '../../config/reportStatus'
import { useProject } from '../../hooks/useProject'
import { useReports } from '../../hooks/useReports'
import { useEquipment } from '../../hooks/useEquipment'
import PMReviewPanel from './components/PMReviewPanel'
import EventLogTab from './reportEditorTabs/EventLogTab'
import ProductionStatsTab from './reportEditorTabs/ProductionStatsTab'
import PhotosTab from './reportEditorTabs/PhotosTab'
import NarrativesTab from './reportEditorTabs/NarrativesTab'
import MetricsTab from './reportEditorTabs/MetricsTab'
import SafetyTab from './reportEditorTabs/SafetyTab'

const CONTENT_TABS = [
  { key: 'event_log', label: 'Event Log', Comp: EventLogTab },
  { key: 'production', label: 'Production Stats', Comp: ProductionStatsTab },
  { key: 'photos', label: 'Photos', Comp: PhotosTab },
  { key: 'narratives', label: 'Narratives', Comp: NarrativesTab },
  { key: 'metrics', label: 'Metrics', Comp: MetricsTab },
  { key: 'safety', label: 'Safety', Comp: SafetyTab },
]

const CHECKLIST_LABELS = {
  event_log_reviewed: 'Event log reviewed',
  transitions_added: 'Transition events added',
  production_stats_entered: 'Production stats entered',
  photos_complete: 'Photos uploaded and labeled',
  narratives_complete: 'Narratives complete',
  metrics_entered: 'Metrics entered',
}

// Not yet derived from real report state -- each item should reflect whether
// its tab actually has data (e.g. event_log_reviewed once EventLogTab has
// entries), not a hardcoded flag. Left false rather than faked true/false
// values so the checklist doesn't claim work is done that isn't.
const CHECKLIST_PLACEHOLDER = {
  event_log_reviewed: false,
  transitions_added: false,
  production_stats_entered: false,
  photos_complete: false,
  narratives_complete: false,
  metrics_entered: false,
}

export default function ReportEditorPage() {
  const { projectId, date } = useParams()
  const { project } = useProject(projectId)
  const { reports, loading: reportsLoading, ensureReport } = useReports(projectId)
  const report = reports.find((r) => r.report_date === date)
  const status = report?.status ?? 'draft'

  useEffect(() => {
    // Wait for the real fetch to finish before deciding a report is missing --
    // otherwise an empty-but-still-loading `reports` array reads as "no report
    // exists yet" and creates a duplicate of one that's already there.
    if (!project || reportsLoading || report) return
    ensureReport({
      project_id: project.id,
      report_date: date,
      status: 'draft',
    })
  }, [project, reportsLoading, report, date, ensureReport])

  const { equipment } = useEquipment(projectId)
  const [mobDay, setMobDay] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState(null)
  const [tab, setTab] = useState('event_log')
  const effectiveEquipmentId = selectedEquipment ?? equipment[0]?.id ?? null

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
                    <Checkbox key={key} size="xs" readOnly label={label} checked={CHECKLIST_PLACEHOLDER[key]} />
                  ))}
                </Stack>
              </Box>

              <Box>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>Equipment</Text>
                <Stack gap={4}>
                  {equipment.map((eq) => (
                    <Button
                      key={eq.id}
                      size="xs"
                      variant={effectiveEquipmentId === eq.id ? 'filled' : 'default'}
                      justify="flex-start"
                      onClick={() => setSelectedEquipment(eq.id)}
                    >
                      {eq.name}
                    </Button>
                  ))}
                </Stack>
              </Box>

              <PMReviewPanel />
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
                  <t.Comp project={project} report={report} equipment={equipment} selectedEquipmentId={effectiveEquipmentId} />
                </Tabs.Panel>
              ))}
            </Tabs>
          </Grid.Col>
        </Grid>
      </Box>
    </ScrollArea>
  )
}
