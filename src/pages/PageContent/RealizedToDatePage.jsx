import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Grid, Text, Table, Badge, Group, Button, Stack } from '@mantine/core'
import { findProject } from '../../data/dashboardSampleData'
import {
  SAMPLE_REALIZED_SUMMARY,
  SAMPLE_PROJECTIONS,
  SAMPLE_DELAY_SUMMARY,
  SAMPLE_WEEKLY_LOG,
  SAMPLE_SHUTDOWN_PERIODS,
} from '../../data/realizedSampleData'

// apg-jfbo-realized-to-date. Sample-mode stand-in for
// jfb-fieldops-daily/src/pages/RealizedToDatePage.tsx.
export default function RealizedToDatePage() {
  const { projectId } = useParams()
  const project = findProject(projectId)
  const s = SAMPLE_REALIZED_SUMMARY

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={1200} mx="auto">
        <Group justify="space-between" mb={4}>
          <Text fw={700} size="lg">Realized To-Date</Text>
          <Link to={`/projects/${projectId}/reports`} style={{ fontSize: 13 }}>← Reports</Link>
        </Group>
        <Text size="sm" c="dimmed" mb={20}>
          Cumulative production vs goal and completion forecast. Internal report — not client-facing.
        </Text>

        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Stack gap="md">
              <Card title={s.projectName}>
                <StatRow label="Goal" value={`${fmt(s.goal)} ${s.unit}`} />
                <StatRow label={`${s.unit} to date`} value={`${fmt(s.toDate)} ${s.unit}`} />
                <StatRow label="Planned to date" value={`${fmt(s.plannedToDate)} ${s.unit}`} />
                <StatRow label={`${s.unit} ahead of pace`} value={`+${fmt(s.cyAheadOfPace)} ${s.unit}`} color="green" />
                <StatRow label="Remaining to goal" value={`${fmt(s.remaining)} ${s.unit}`} />
                <StatRow label="Percent complete" value={`${(s.pctComplete * 100).toFixed(1)}%`} />
                <StatRow label="Bid goal rate" value={`${s.bidRate} ${s.unit}/GOH`} />
                <StatRow label="Current rate" value={`${s.currentRate} ${s.unit}/GOH`} />
                <StatRow label="Pace" value={`${s.daysAheadBehind} days ahead`} color="green" />
              </Card>

              <Card title="Projected completion">
                <Table fz="sm" withRowBorders={false}>
                  <Table.Thead>
                    <Table.Tr><Table.Th>Scenario</Table.Th><Table.Th ta="right">Rate</Table.Th><Table.Th ta="right">Days left</Table.Th><Table.Th ta="right">Finish</Table.Th></Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {SAMPLE_PROJECTIONS.map((p) => (
                      <Table.Tr key={p.key}>
                        <Table.Td>{p.label}</Table.Td>
                        <Table.Td ta="right">{p.rate}</Table.Td>
                        <Table.Td ta="right">{p.daysLeft}</Table.Td>
                        <Table.Td ta="right">{p.estFinish}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Card>

              <Card title="Delay summary · this week">
                <Table fz="sm" withRowBorders={false}>
                  <Table.Thead>
                    <Table.Tr><Table.Th>Description</Table.Th><Table.Th ta="right">Hours</Table.Th><Table.Th ta="right">%</Table.Th></Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {SAMPLE_DELAY_SUMMARY.map((d) => (
                      <Table.Tr key={d.description}>
                        <Table.Td>{d.description}</Table.Td>
                        <Table.Td ta="right">{d.hours}</Table.Td>
                        <Table.Td ta="right">{(d.pct * 100).toFixed(0)}%</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Card>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Card title="Weekly log" noPad>
              <Table fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th><Table.Th ta="right">{s.unit}</Table.Th><Table.Th ta="right">GOH</Table.Th>
                    <Table.Th ta="right">{s.unit}/GOH</Table.Th><Table.Th ta="right">Running {s.unit}</Table.Th><Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {SAMPLE_WEEKLY_LOG.map((wk) => (
                    <WeekBlock key={wk.projectWeek} wk={wk} unit={s.unit} />
                  ))}
                </Table.Tbody>
              </Table>
            </Card>

            <Card title="Shutdown periods" mt="md">
              <Stack gap={6}>
                {SAMPLE_SHUTDOWN_PERIODS.map((p) => (
                  <Group key={p.id} justify="space-between">
                    <Text size="sm">{p.start} – {p.end}</Text>
                    <Text size="xs" c="dimmed">{p.reason}</Text>
                  </Group>
                ))}
                <Button size="xs" variant="default" w="fit-content">+ Add shutdown period</Button>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      </Box>
    </ScrollArea>
  )
}

function WeekBlock({ wk, unit }) {
  return (
    <>
      <Table.Tr style={{ background: 'var(--mantine-color-gray-0)' }}>
        <Table.Td colSpan={6}><Text size="xs" fw={700} tt="uppercase">Week {wk.projectWeek}</Text></Table.Td>
      </Table.Tr>
      {wk.rows.map((r) => (
        <Table.Tr key={r.date} style={r.excluded ? { color: 'var(--mantine-color-gray-5)' } : undefined}>
          <Table.Td>
            {r.date}
            {r.excluded && r.reason && <Text size="10px" fs="italic">Excluded — {r.reason}</Text>}
          </Table.Td>
          <Table.Td ta="right">{fmt(r.cy)}</Table.Td>
          <Table.Td ta="right">{r.goh}</Table.Td>
          <Table.Td ta="right">{r.cyPerGoh}</Table.Td>
          <Table.Td ta="right">{r.excluded ? '—' : fmt(r.runningCy)}</Table.Td>
          <Table.Td ta="right">
            <Text size="xs">{r.excluded ? 'Include' : 'Exclude'}</Text>
          </Table.Td>
        </Table.Tr>
      ))}
      <Table.Tr style={{ background: 'var(--mantine-color-gray-0)', fontWeight: 600 }}>
        <Table.Td>Week {wk.projectWeek} subtotal</Table.Td>
        <Table.Td ta="right">{fmt(wk.subtotalCy)}</Table.Td>
        <Table.Td ta="right">{wk.subtotalGoh}</Table.Td>
        <Table.Td colSpan={3} />
      </Table.Tr>
    </>
  )
}

function Card({ title, children, noPad, mt }) {
  return (
    <Box mt={mt} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, overflow: 'hidden' }}>
      <Box p={noPad ? '12px 16px' : 16} pb={noPad ? 8 : 16}>
        <Text fw={600} size="sm" mb={noPad ? 0 : 8}>{title}</Text>
        {!noPad && children}
      </Box>
      {noPad && children}
    </Box>
  )
}

function StatRow({ label, value, color }) {
  return (
    <Group justify="space-between" py={4} style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}>
      <Text size="xs" c="dimmed" tt="uppercase">{label}</Text>
      <Text size="sm" fw={500} c={color}>{value}</Text>
    </Group>
  )
}

function fmt(n) {
  return n?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? '—'
}
