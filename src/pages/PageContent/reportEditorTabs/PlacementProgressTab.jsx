import { Box, SimpleGrid, Text, Progress } from '@mantine/core'
import { SAMPLE_PLACEMENT_PROGRESS } from '../../../data/reportEditorSampleData'
import { ChartPlaceholder } from './DredgeProgressTab'

// Real PlacementProgressTab parses an uploaded .bkt bucket-log file and
// attributes it against layer windows — out of scope for a sample-data UI.
export default function PlacementProgressTab() {
  const p = SAMPLE_PLACEMENT_PROGRESS
  return (
    <Box>
      <SimpleGrid cols={{ base: 2, sm: 4 }} mb={16}>
        <Stat label="Active layer" value={p.layer} />
        <Stat label="Tons today" value={p.tonsPlacedToday} />
        <Stat label="Tons to date" value={p.tonsPlacedTotal.toLocaleString()} />
        <Stat label="Coverage" value={`${p.coveragePct}%`} />
      </SimpleGrid>
      <Progress value={p.coveragePct} size="lg" mb={16} color="teal" />
      <ChartPlaceholder label="Placement coverage chart (bucket-log render)" />
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
