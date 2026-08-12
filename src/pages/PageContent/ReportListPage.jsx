import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Group, Text, Badge, Table, Button, TextInput } from '@mantine/core'
import { findProject, SAMPLE_REPORTS_BY_PROJECT, REPORT_STATUS_LABEL, REPORT_STATUS_COLOR } from '../../data/dashboardSampleData'

// apg-jfbo-report-list — per-project report list. Sample-mode stand-in for
// jfb-fieldops-daily/src/pages/ReportList.tsx. See src/config/sampleMode.js.
export default function ReportListPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const project = findProject(projectId)
  const reports = SAMPLE_REPORTS_BY_PROJECT[projectId] ?? []
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDate, setPickerDate] = useState('2026-08-11')

  const groups = groupByCalWeek(reports)

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={960} mx="auto">
        <Link to="/" style={{ fontSize: 12 }}>← Dashboard</Link>

        <Group justify="space-between" align="flex-start" mt={6} mb={16}>
          <Box>
            <Text fw={700} size="lg">{project?.name ?? 'Reports'}</Text>
            {project && (
              <Text size="xs" c="dimmed">
                #{project.project_code} · {project.client} · {project.work_type}
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
            <Button size="xs" mt={18} onClick={() => navigate(`/projects/${projectId}/reports/${pickerDate}`)}>
              Start
            </Button>
            <Button size="xs" mt={18} variant="default" onClick={() => setPickerOpen(false)}>Cancel</Button>
          </Group>
        )}

        {groups.length === 0 && (
          <Box p={40} ta="center" style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8 }}>
            <Text fw={500}>No reports yet for this project.</Text>
            <Text size="sm" c="dimmed" mt={4}>Reports appear here once operators log events, or a PE starts one.</Text>
          </Box>
        )}

        {groups.map((g) => (
          <Box key={g.key} mb={24}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>{g.label}</Text>
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
                {g.rows.map((r) => (
                  <Table.Tr key={r.date} style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${projectId}/reports/${r.date}`)}>
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
          </Box>
        ))}
      </Box>
    </ScrollArea>
  )
}

function groupByCalWeek(rows) {
  const out = []
  for (const r of rows) {
    const key = r.calWeek != null ? `cw-${r.calWeek}` : 'uncoded'
    const label = r.calWeek != null
      ? (r.projectWeek != null ? `Cal Week ${r.calWeek} · Project Week ${r.projectWeek}` : `Cal Week ${r.calWeek}`)
      : 'No week assigned'
    const last = out[out.length - 1]
    if (last && last.key === key) last.rows.push(r)
    else out.push({ key, label, rows: [r] })
  }
  return out
}
