import { Box, SimpleGrid, Text, Progress } from '@mantine/core'
import { IconChartAreaLine } from '@tabler/icons-react'
import { SAMPLE_DREDGE_PROGRESS } from '../../../data/reportEditorSampleData'

// Real DredgeProgressTab renders a canvas chart from HYPACK survey/DXF data —
// out of scope for a sample-data UI. This shows the same summary stats with
// a placeholder chart area.
export default function DredgeProgressTab() {
  const d = SAMPLE_DREDGE_PROGRESS
  return (
    <Box>
      <SimpleGrid cols={{ base: 2, sm: 4 }} mb={16}>
        <Stat label="Coverage" value={`${d.totalCoveragePct}%`} />
        <Stat label="Cells complete" value={`${d.cellsComplete} / ${d.cellsTotal}`} />
        <Stat label="Last survey" value={d.lastSurveyDate} />
      </SimpleGrid>
      <Progress value={d.totalCoveragePct} size="lg" mb={16} />
      <ChartPlaceholder label="Dredge coverage chart (HYPACK survey render)" />
    </Box>
  )
}

function Stat({ label, value }) {
  return (
    <Box>
      <Text size="10px" tt="uppercase" c="dimmed">{label}</Text>
      <Text size="sm" fw={600}>{value}</Text>
    </Box>
  )
}

export function ChartPlaceholder({ label }) {
  return (
    <Box
      h={220}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: 'var(--mantine-color-gray-0)', border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8,
      }}
    >
      <IconChartAreaLine size={28} color="var(--mantine-color-gray-5)" />
      <Text size="xs" c="dimmed">{label}</Text>
    </Box>
  )
}
