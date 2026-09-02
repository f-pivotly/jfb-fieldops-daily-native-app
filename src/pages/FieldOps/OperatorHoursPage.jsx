import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, ScrollArea, Group, Text, Table } from '@mantine/core'
import { executeDataView } from '../../data'

function fmtHours(h) {
  return Number(h).toFixed(2)
}

export default function OperatorHoursPage() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setError(null)
    executeDataView('dvw-jfb-operator-hours', {})
      .then((data) => { if (!cancelled) setRows(data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={960} mx="auto">
        <Group justify="space-between" align="baseline" mb={4}>
          <Text fw={700} size="lg">Operators</Text>
          <Text component={Link} to="/" size="sm">← Dashboard</Text>
        </Group>
        <Text size="sm" c="dimmed" mb={20}>
          Cross-project totals by operator. Hours add up across every project and piece of equipment
          a person ran.
        </Text>

        {error && (
          <Text size="sm" c="red" mb={16}>{error}</Text>
        )}

        {!rows && !error && (
          <Text size="sm" c="dimmed">Loading operator totals…</Text>
        )}

        {rows?.length === 0 && (
          <Box p={40} ta="center" style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8 }}>
            <Text fw={500}>No operator hours logged yet.</Text>
          </Box>
        )}

        {rows && rows.length > 0 && (
          <Table withTableBorder verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Operator</Table.Th>
                <Table.Th ta="right">Operating hrs</Table.Th>
                <Table.Th ta="right">Delay hrs</Table.Th>
                <Table.Th ta="right">Projects</Table.Th>
                <Table.Th ta="right">Events</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.operator_id}>
                  <Table.Td fw={500}>{r.full_name}</Table.Td>
                  <Table.Td ta="right">{fmtHours(r.operating_hours)}</Table.Td>
                  <Table.Td ta="right">{fmtHours(r.delay_hours)}</Table.Td>
                  <Table.Td ta="right">{r.project_count}</Table.Td>
                  <Table.Td ta="right">{r.event_count}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Text size="xs" c="dimmed" mt={16}>
          CY moved isn&apos;t shown yet — production_stats has no per-operator column, so it can only
          ever be an estimate. That&apos;s a separate follow-up.
        </Text>
      </Box>
    </ScrollArea>
  )
}
