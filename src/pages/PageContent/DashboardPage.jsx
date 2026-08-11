import { Box, SimpleGrid, Card, Text, Badge, Group, Stack, ScrollArea } from '@mantine/core'
import { SAMPLE_PROJECTS, REPORT_STATUS_LABEL, REPORT_STATUS_COLOR } from '../../data/dashboardSampleData'

// apg-jfbo-dashboard — Project Dashboard. Sample-mode stand-in; see
// src/config/sampleMode.js and JFB_FIELDOPS_DAILY_SCREENS_AND_PAGE_SLUGS.md.
export default function DashboardPage() {
  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24}>
        <Group justify="space-between" mb={20}>
          <Text fw={700} size="lg">Project Dashboard</Text>
          <Badge variant="light" color="gray">Sample data</Badge>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {SAMPLE_PROJECTS.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </SimpleGrid>
      </Box>
    </ScrollArea>
  )
}

function ProjectCard({ project }) {
  return (
    <Card withBorder radius="md" padding="lg">
      <Group justify="space-between" align="flex-start" mb={10} wrap="nowrap">
        <Box style={{ minWidth: 0 }}>
          <Text fw={600} truncate="end">{project.name}</Text>
          <Text size="xs" c="dimmed">
            #{project.project_code} · {project.client}
          </Text>
        </Box>
        <Badge color={REPORT_STATUS_COLOR[project.today_status]} size="sm">
          {REPORT_STATUS_LABEL[project.today_status]}
        </Badge>
      </Group>

      <Stack gap={6} mt="sm">
        <DetailRow label="Equipment" value={`${project.equipment_count} ${project.equipment_count === 1 ? 'unit' : 'units'}`} />
        <DetailRow label="Work type" value={project.work_type} />
        <DetailRow label="Last report" value={project.last_report_date ?? 'None yet'} />
      </Stack>
    </Card>
  )
}

function DetailRow({ label, value }) {
  return (
    <Group justify="space-between">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="xs" fw={500}>{value}</Text>
    </Group>
  )
}
