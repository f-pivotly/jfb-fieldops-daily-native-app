import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Group, Text, Badge, Table, Button, TextInput } from '@mantine/core'
import { REPORT_STATUS_LABEL, REPORT_STATUS_COLOR } from '../../config/reportStatus'
import { useProject } from '../../hooks/useProject'
import { useReports } from '../../hooks/useReports'

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayOf(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? '' : DAY_LABEL[d.getUTCDay()]
}

export default function ReportListPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { project } = useProject(projectId)
  // Filter reports by the URL's own projectId, not project?.id -- project?.id
  // depends on the separate useProject fetch resolving first, which briefly
  // leaves it undefined on load and fires an unnecessary unfiltered fetch of
  // every project's reports. projectId is already the right value the whole
  // time (it's literally in the URL), so there's nothing to wait for.
  const { reports: reportRecords } = useReports(projectId)
  const reports = reportRecords
    .map((r) => ({
      id: r.id,
      date: r.report_date,
      day: dayOf(r.report_date),
      status: r.status,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDate, setPickerDate] = useState('2026-08-11')

  // Only navigates -- ReportEditorPage's own effect is the single place that
  // creates a report if one doesn't exist yet for this project+date, so two
  // independent "check, then create" call sites can't race each other.
  function startReport(dateISO) {
    navigate(`/projects/${projectId}/reports/${dateISO}`)
  }

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={960} mx="auto">
        <Link to="/" style={{ fontSize: 12 }}>← Dashboard</Link>

        <Group justify="space-between" align="flex-start" mt={6} mb={16}>
          <Box>
            <Text fw={700} size="lg">{project?.name ?? 'Reports'}</Text>
            {project && (
              <Text size="xs" c="dimmed">
                #{project.project_code} · {project.client_name} · {project.work_type}
              </Text>
            )}
          </Box>
          <Group gap={8}>
            {project && (
              <>
                <Button component={Link} to={`/projects/${projectId}/weekly`} variant="default" size="xs">
                  Weekly Summary
                </Button>
                <Button component={Link} to={`/projects/${projectId}/realized`} variant="default" size="xs">
                  Realized To-Date
                </Button>
                <Button component={Link} to={`/projects/${projectId}/settings`} variant="default" size="xs">
                  Settings
                </Button>
              </>
            )}
          </Group>
        </Group>

        {!pickerOpen ? (
          <Button size="xs" onClick={() => setPickerOpen(true)} mb={20}>+ Start a report</Button>
        ) : (
          <Group gap={8} mb={20} p={10} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
            <TextInput type="date" size="xs" value={pickerDate} onChange={(e) => setPickerDate(e.currentTarget.value)} label="Report date" />
            <Button size="xs" mt={18} onClick={() => startReport(pickerDate)}>
              Start
            </Button>
            <Button size="xs" mt={18} variant="default" onClick={() => setPickerOpen(false)}>Cancel</Button>
          </Group>
        )}

        {reports.length === 0 && (
          <Box p={40} ta="center" style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8 }}>
            <Text fw={500}>No reports yet for this project.</Text>
            <Text size="sm" c="dimmed" mt={4}>Reports appear here once operators log events, or a PE starts one.</Text>
          </Box>
        )}

        {reports.length > 0 && (
          <Table withTableBorder verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Day</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {reports.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${projectId}/reports/${r.date}`)}>
                  <Table.Td>
                    <Text component={Link} to={`/projects/${projectId}/reports/${r.date}`} fw={500} size="sm">
                      {r.date}
                    </Text>
                  </Table.Td>
                  <Table.Td>{r.day}</Table.Td>
                  <Table.Td>
                    <Badge color={REPORT_STATUS_COLOR[r.status]} size="sm">{REPORT_STATUS_LABEL[r.status]}</Badge>
                  </Table.Td>
                  <Table.Td ta="right">
                    {r.status === 'released' && (
                      <Text
                        component={Link}
                        to={`/projects/${projectId}/realized`}
                        size="xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Realized To-Date
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Box>
    </ScrollArea>
  )
}
