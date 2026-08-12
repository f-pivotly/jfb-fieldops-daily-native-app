import { Link } from 'react-router-dom'
import { Box, ScrollArea, Text, Group, Table } from '@mantine/core'
import { SAMPLE_OPERATORS } from '../../data/operatorsSampleData'

export default function OperatorHoursPage() {
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
            {SAMPLE_OPERATORS.map((r) => (
              <Table.Tr key={r.person_id}>
                <Table.Td fw={500}>{r.full_name}</Table.Td>
                <Table.Td ta="right">{r.operating_hours.toFixed(1)}</Table.Td>
                <Table.Td ta="right">{r.delay_hours.toFixed(1)}</Table.Td>
                <Table.Td ta="right">{r.cy_moved.toLocaleString()}</Table.Td>
                <Table.Td ta="right">{r.project_count}</Table.Td>
                <Table.Td ta="right">{r.event_count}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        <Text size="xs" c="dimmed" mt={16}>
          CY moved is estimated from each operator's share of operating hours on a machine each day.
        </Text>
      </Box>
    </ScrollArea>
  )
}
