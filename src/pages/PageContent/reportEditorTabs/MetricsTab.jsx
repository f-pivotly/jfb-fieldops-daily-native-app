import { Table, TextInput, Text, Badge } from '@mantine/core'
import { useState } from 'react'
import { SAMPLE_METRICS } from '../../../data/reportEditorSampleData'

export default function MetricsTab() {
  const [rows, setRows] = useState(SAMPLE_METRICS)

  return (
    <Table withTableBorder verticalSpacing="xs" fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Metric</Table.Th>
          <Table.Th>Source</Table.Th>
          <Table.Th ta="right">Day</Table.Th>
          <Table.Th ta="right">Week</Table.Th>
          <Table.Th ta="right">Total</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.key}>
            <Table.Td>{r.label}</Table.Td>
            <Table.Td>
              <Badge size="xs" variant="light" color={r.source === 'Auto' ? 'blue' : 'gray'}>{r.source}</Badge>
            </Table.Td>
            <Table.Td ta="right">
              {r.source === 'Auto' ? (
                <Text size="sm">{r.day} {r.unit}</Text>
              ) : (
                <TextInput
                  size="xs"
                  value={r.day}
                  onChange={(e) => {
                    const v = e.currentTarget.value === '' ? '' : Number(e.currentTarget.value)
                    setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, day: v } : x)))
                  }}
                />
              )}
            </Table.Td>
            <Table.Td ta="right">{r.week} {r.unit}</Table.Td>
            <Table.Td ta="right">{r.total.toLocaleString()} {r.unit}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}
