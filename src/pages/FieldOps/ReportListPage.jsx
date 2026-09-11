import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Group, Text, Badge, Table, Button, TextInput } from '@mantine/core'
import { REPORT_STATUS_LABEL, REPORT_STATUS_COLOR } from '../../config/reportStatus'
import { useProject } from '../../hooks/useProject'
import { useReports } from '../../hooks/useReports'
import { useFieldOpsAction } from '../../contexts/fieldOpsAccessContext'
import { executeDataView } from '../../data'
import { todayISO, addDaysISO } from './lib/realizedToDate'
import { isoCalWeek, projectWeekNumber } from './lib/reportPdfData'
import { WARNING_BG } from './reportEditorTabs/components/WarningBanner'

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayOf(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? '' : DAY_LABEL[d.getUTCDay()]
}

function yesterdayISO() {
  return addDaysISO(todayISO(), -1)
}

// One section per calendar week, matching the non-native app's grouping --
// keyed on isoCalWeek/projectWeekNumber computed client-side for every row
// (report or pending), rather than a stored cal_week/project_week column
// the way the non-native app's report_dates row carries. That also means
// a pending row (no report row yet) can be grouped correctly instead of
// falling into an "uncoded" bucket the way the non-native app's own pending
// rows do -- native has no reason to reproduce that gap since the week
// number is computable from the date alone.
function groupByCalWeek(rows, project) {
  const out = []
  for (const r of rows) {
    const cw = isoCalWeek(r.date)
    const pw = projectWeekNumber(r.date, project?.start_date)
    const key = `cw-${cw}`
    const label = pw != null ? `Cal Week ${cw} · Project Week ${pw}` : `Cal Week ${cw}`
    const last = out[out.length - 1]
    if (last && last.key === key) last.rows.push(r)
    else out.push({ key, label, rows: [r] })
  }
  return out
}

export default function ReportListPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { project } = useProject(projectId)
  const { reports: reportRecords } = useReports(projectId)
  const canManageSettings = useFieldOpsAction('manage_project_settings')

  const [eventDates, setEventDates] = useState([])
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    executeDataView('dvw-jfb-distinct-event-dates', { p_project_id: projectId })
      .then((rows) => {
        if (cancelled) return
        const dates = (Array.isArray(rows) ? rows : []).map((r) => String(r.event_date).slice(0, 10))
        setEventDates(dates)
      })
      .catch(() => { if (!cancelled) setEventDates([]) })
    return () => { cancelled = true }
  }, [projectId])

  const reportDateSet = new Set(reportRecords.map((r) => r.report_date))
  const reportRows = reportRecords.map((r) => ({
    kind: 'report',
    id: r.id,
    date: r.report_date,
    day: dayOf(r.report_date),
    status: r.status,
  }))
  const pendingRows = eventDates
    .filter((d) => !reportDateSet.has(d))
    .map((d) => ({ kind: 'pending', id: `pending-${d}`, date: d, day: dayOf(d) }))
  const rows = [...reportRows, ...pendingRows].sort((a, b) => b.date.localeCompare(a.date))
  const groups = groupByCalWeek(rows, project)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDate, setPickerDate] = useState(yesterdayISO())
  const today = todayISO()
  const pickerAlreadyExists = reportDateSet.has(pickerDate)
  const pickerHasEvents = eventDates.includes(pickerDate)

  function openPicker() {
    setPickerDate(yesterdayISO())
    setPickerOpen(true)
  }

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
                {canManageSettings && (
                  <Button component={Link} to={`/projects/${projectId}/settings`} variant="default" size="xs">
                    Settings
                  </Button>
                )}
              </>
            )}
          </Group>
        </Group>

        {!pickerOpen ? (
          <Button size="xs" onClick={openPicker} mb={20}>+ Start a report</Button>
        ) : (
          <Box mb={20} p={10} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
            <Group gap={8} align="flex-end">
              <TextInput
                type="date"
                size="xs"
                value={pickerDate}
                max={today}
                onChange={(e) => setPickerDate(e.currentTarget.value)}
                label="Report date"
              />
              <Button size="xs" variant="subtle" onClick={() => setPickerDate(yesterdayISO())}>Yesterday</Button>
              <Button size="xs" variant="subtle" onClick={() => setPickerDate(today)}>Today</Button>
              <Button size="xs" onClick={() => startReport(pickerDate)}>
                {pickerAlreadyExists ? 'Open existing' : 'Start'}
              </Button>
              <Button size="xs" variant="default" onClick={() => setPickerOpen(false)}>Cancel</Button>
            </Group>
            {pickerAlreadyExists ? (
              <Text size="10px" c="dimmed" mt={6}>A report already exists for this date — will open the existing one.</Text>
            ) : pickerHasEvents ? (
              <Text size="10px" c="orange.8" mt={6}>Events exist for this date but no report has been started yet. Click Start to create it.</Text>
            ) : (
              <Text size="10px" c="dimmed" mt={6}>No events synced for this date yet — creating a report will still work.</Text>
            )}
          </Box>
        )}

        {rows.length === 0 && (
          <Box p={40} ta="center" style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8 }}>
            <Text fw={500}>No reports yet for this project.</Text>
            <Text size="sm" c="dimmed" mt={4}>Reports appear here once operators log events, or a PE starts one.</Text>
          </Box>
        )}

        {groups.map((group) => (
          <Box key={group.key} mb={20}>
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>{group.label}</Text>
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
                {group.rows.map((r) => (
                  <Table.Tr
                    key={r.id}
                    style={{ cursor: 'pointer', ...(r.kind === 'pending' ? { background: WARNING_BG } : {}) }}
                    onClick={() => navigate(`/projects/${projectId}/reports/${r.date}`)}
                  >
                    <Table.Td>
                      <Text component={Link} to={`/projects/${projectId}/reports/${r.date}`} fw={500} size="sm">
                        {r.date}
                      </Text>
                    </Table.Td>
                    <Table.Td>{r.day}</Table.Td>
                    <Table.Td>
                      {r.kind === 'report' ? (
                        <Badge color={REPORT_STATUS_COLOR[r.status]} size="sm">{REPORT_STATUS_LABEL[r.status]}</Badge>
                      ) : (
                        <Badge color="orange" variant="light" size="sm">Not started</Badge>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      {r.kind === 'report' && r.status === 'released' && (
                        <Text
                          component={Link}
                          to={`/projects/${projectId}/realized`}
                          size="xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Realized To-Date
                        </Text>
                      )}
                      {r.kind === 'pending' && (
                        <Text size="xs" fw={600}>Start →</Text>
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
