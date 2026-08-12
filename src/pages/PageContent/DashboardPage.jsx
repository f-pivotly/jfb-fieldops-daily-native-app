import { useNavigate } from 'react-router-dom'
import { Box, SimpleGrid, Card, Text, Group, Stack, ScrollArea } from '@mantine/core'
import { useDomainData } from '../../hooks/useDomainData'
import LoadingSpinner from '../../components/LoadingSpinner'
import SafeError from '../../components/SafeError'

export default function DashboardPage() {
  const { records, loading, error } = useDomainData({ domain: 'projects', system: 'core' })

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24}>
        <Group justify="space-between" mb={20}>
          <Text fw={700} size="lg">Project Dashboard</Text>
        </Group>

        {loading && <LoadingSpinner py={24} />}
        {!loading && <SafeError message={error} />}
        {!loading && !error && records.length === 0 && (
          <Text size="sm" c="dimmed">No projects yet.</Text>
        )}

        {!loading && !error && records.length > 0 && (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {records.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </SimpleGrid>
        )}
      </Box>
    </ScrollArea>
  )
}

function ProjectCard({ project }) {
  const navigate = useNavigate()
  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
      style={{ cursor: 'pointer' }}
      onClick={() => navigate(`/projects/${project.id}/reports`)}
    >
      <Box mb={10}>
        <Text fw={600} truncate="end">{project.name}</Text>
        <Text size="xs" c="dimmed">
          #{project.project_code ?? '—'} · {project.client_name ?? '—'}
        </Text>
      </Box>

      <Stack gap={6} mt="sm">
        <DetailRow label="Work type" value={project.work_type ?? '—'} />
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
