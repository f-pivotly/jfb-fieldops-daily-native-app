import { Box, SimpleGrid, Text, Progress, Table, NumberInput, Group } from '@mantine/core'
import { useState } from 'react'
import { SAMPLE_PLACEMENT_PROGRESS, SAMPLE_BUCKET_ATTRIBUTION } from '../../../data/reportEditorSampleData'
import { ChartPlaceholder } from './DredgeProgressTab'

export default function PlacementProgressTab() {
  const p = SAMPLE_PLACEMENT_PROGRESS
  const [rows, setRows] = useState(SAMPLE_BUCKET_ATTRIBUTION)

  function updateBuckets(id, value) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, buckets: value ?? 0 } : r)))
  }

  const totalBuckets = rows.reduce((sum, r) => sum + (r.buckets || 0), 0)
  const totalSf = rows.reduce((sum, r) => sum + (r.buckets || 0) * r.avgSfPerBucket, 0)

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

      <Box mt={20} p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
        <Text fw={600} size="sm" mb={4}>Bucket → SF Attribution</Text>
        <Text size="xs" c="dimmed" mb={10}>
          Enter today's bucket count per layer/material; SF is attributed using each combo's average SF per bucket.
        </Text>
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Layer</Table.Th>
              <Table.Th>Material</Table.Th>
              <Table.Th ta="right">Avg SF/bucket</Table.Th>
              <Table.Th ta="right">Buckets today</Table.Th>
              <Table.Th ta="right">Attributed SF</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.layer}</Table.Td>
                <Table.Td>{r.material}</Table.Td>
                <Table.Td ta="right">{r.avgSfPerBucket}</Table.Td>
                <Table.Td>
                  <NumberInput size="xs" hideControls value={r.buckets} onChange={(v) => updateBuckets(r.id, v)} />
                </Table.Td>
                <Table.Td ta="right">{(r.buckets * r.avgSfPerBucket).toLocaleString()}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Th colSpan={3}>Totals</Table.Th>
              <Table.Th ta="right">{totalBuckets}</Table.Th>
              <Table.Th ta="right">{totalSf.toLocaleString()}</Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
        <Group justify="flex-end" mt={8}>
          <Text size="xs" c="dimmed">{totalBuckets} buckets attributed today</Text>
        </Group>
      </Box>
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
