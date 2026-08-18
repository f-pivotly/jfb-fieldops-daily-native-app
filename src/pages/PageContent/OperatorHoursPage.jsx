import { Link } from 'react-router-dom'
import { Box, ScrollArea, Text, Group, Table } from '@mantine/core'
import { useOperators } from '../../hooks/useOperators'
import { SAMPLE_OPERATORS } from '../../data/operatorsSampleData'

export default function OperatorHoursPage() {
  const { operators } = useOperators()

  // Real operator identity from jfb_operators; the metric columns have no
  // aggregation pipeline yet, so they cycle through the same sample figures
  // (deterministic by row index, not random) until that's built.
  const rows = operators.map((op, i) => ({
    person_id: op.id,
    full_name: op.name,
    ...SAMPLE_OPERATORS[i % SAMPLE_OPERATORS.length],
  }))

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={900} mx="auto">
        <Group justify="space-between" mb={4}>
          <Text fw={700} size="lg">Operators</Text>
          <Link to="/" style={{ fontSize: 13 }}>← Dashboard</Link>
        </Group>
        <Text size="sm" c="dimmed" mb={16}>
          Cross-project totals by operator. Hours and dirt add up across every project and piece of equipment a person ran.
        </Text>

        <Table withTableBorder verticalSpacing="sm" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Operator</Table.Th>
              <Table.Th ta="right">Operating hrs</Table.Th>
              <Table.Th ta="right">Delay hrs</Table.Th>
              <Table.Th ta="right">CY moved (est.)</Table.Th>
              <Table.Th ta="right">Projects</Table.Th>
              <Table.Th ta="right">Events</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text size="xs" c="dimmed" ta="center" py={12}>No operators yet.</Text>
                </Table.Td>
              </Table.Tr>
            )}
            {rows.map((r) => (
              <Table.Tr key={r.person_id}>
                <Table.Td fw={500}>{r.full_name}</Table.Td>
                <Table.Td ta="right" c="dimmed">{r.operating_hours.toFixed(1)} (sampleData)</Table.Td>
                <Table.Td ta="right" c="dimmed">{r.delay_hours.toFixed(1)} (sampleData)</Table.Td>
                <Table.Td ta="right" c="dimmed">{r.cy_moved.toLocaleString()} (sampleData)</Table.Td>
                <Table.Td ta="right" c="dimmed">{r.project_count} (sampleData)</Table.Td>
                <Table.Td ta="right" c="dimmed">{r.event_count} (sampleData)</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        <Text size="xs" c="dimmed" mt={16}>
          Operator names are real (jfb_operators). Everything marked (sampleData) has no aggregation pipeline wired up yet.
        </Text>
      </Box>
    </ScrollArea>
  )
}
