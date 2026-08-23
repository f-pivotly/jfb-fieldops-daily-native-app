import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, ScrollArea, Text, Group, Button, Stack, Textarea, SimpleGrid, Switch, Table } from '@mantine/core'
import { IconPhoto } from '@tabler/icons-react'

// Not yet backed by real domains -- render empty until they're established.
const WEEK_RANGE_PLACEHOLDER = { start: '', end: '', reportedCount: 0 }
const WEEKLY_PHOTOS_PLACEHOLDER = []
const WEEKLY_PRODUCTION_PLACEHOLDER = { unit: '', plannedCy: 0, actualCy: 0, goh: 0 }
const WEEKLY_DELAYS_PLACEHOLDER = []

export default function WeeklySummaryPage() {
  const { projectId } = useParams()
  const [aiOn, setAiOn] = useState(false)
  const [sections, setSections] = useState([])
  const w = WEEK_RANGE_PLACEHOLDER
  const p = WEEKLY_PRODUCTION_PLACEHOLDER

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={900} mx="auto">
        <Group justify="space-between" mb={4}>
          <Text fw={700} size="lg">Weekly Summary</Text>
          <Link to={`/projects/${projectId}/reports`} style={{ fontSize: 13 }}>← Reports</Link>
        </Group>
        <Text size="sm" c="dimmed" mb={16}>
          Client-facing roll-up of the week's daily narratives, production, and delays.
        </Text>

        <Group justify="space-between" p={12} mb={20} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
          <Text size="sm">← Previous week</Text>
          <Box ta="center">
            <Text size="sm" fw={500}>{w.start} – {w.end}</Text>
            <Text size="10px" c="dimmed">{w.reportedCount} released reports this week</Text>
          </Box>
          <Text size="sm">Next week →</Text>
        </Group>

        <Group justify="space-between" p={12} mb={20} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
          <Box>
            <Text size="sm" fw={500}>AI first-draft summary</Text>
            <Text size="10px" c="dimmed">
              {aiOn ? 'Sections seeded with a draft summary.' : 'Off — sections seeded with daily entries to summarize by hand.'}
            </Text>
          </Box>
          <Switch checked={aiOn} onChange={(e) => setAiOn(e.currentTarget.checked)} />
        </Group>

        <Text fw={600} mb={4}>Narrative summary</Text>
        <Text size="10px" c="dimmed" mb={10}>Each section shows the week's daily entries as reference.</Text>
        <Stack gap="md" mb={20}>
          {sections.map((s) => (
            <Box key={s.key} p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
              <Text size="sm" fw={600} mb={6}>{s.label}</Text>
              <Stack gap={2} mb={8}>
                {s.entries.map((e) => (
                  <Text key={e.date} size="xs" c="dimmed">{e.date} — {e.text}</Text>
                ))}
              </Stack>
              <Textarea
                autosize
                minRows={2}
                value={aiOn ? s.value : ''}
                placeholder={aiOn ? '' : 'Write a week-level summary…'}
                onChange={(ev) => setSections((prev) => prev.map((x) => (x.key === s.key ? { ...x, value: ev.currentTarget.value } : x)))}
              />
            </Box>
          ))}
        </Stack>

        <Text fw={600} mb={4}>Photos</Text>
        <Text size="10px" c="dimmed" mb={10}>Two photos for the weekly PDF. JPEG / PNG / HEIC · 10 MB max.</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} mb={20}>
          {WEEKLY_PHOTOS_PLACEHOLDER.map((ph) => (
            <Box key={ph.slot} h={120} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--mantine-color-gray-0)', border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8 }}>
              <IconPhoto size={28} color="var(--mantine-color-gray-5)" />
            </Box>
          ))}
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }} mb={20}>
          <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
            <Text fw={600} size="sm" mb={8}>Production</Text>
            <Text size="sm">Planned: {p.plannedCy.toLocaleString()} {p.unit}</Text>
            <Text size="sm">Actual: {p.actualCy.toLocaleString()} {p.unit}</Text>
            <Text size="sm">GOH: {p.goh}</Text>
          </Box>
          <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
            <Text fw={600} size="sm" mb={8}>Delay summary · this week</Text>
            <Table fz="sm" withRowBorders={false}>
              <Table.Tbody>
                {WEEKLY_DELAYS_PLACEHOLDER.map((d) => (
                  <Table.Tr key={d.description}>
                    <Table.Td>{d.description}</Table.Td>
                    <Table.Td ta="right">{d.hours}h</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        </SimpleGrid>

        <Button size="xs">Download PDF</Button>
      </Box>
    </ScrollArea>
  )
}
