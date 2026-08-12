import { Table, Badge, Text, Box } from '@mantine/core'
import { SAMPLE_WATER_QUALITY } from '../../../data/reportEditorSampleData'

// Real WaterQualityTab auto-pulls HydroVu turbidity readings. This shows the
// same reading shape as a static sample table.
export default function WaterQualityTab() {
  return (
    <Box>
      <Text size="xs" c="dimmed" mb={10}>Auto-pulled from HydroVu (sample readings shown)</Text>
      <Table withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Time</Table.Th>
            <Table.Th ta="right">Background NTU</Table.Th>
            <Table.Th ta="right">Compliance NTU</Table.Th>
            <Table.Th ta="right">Alert</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {SAMPLE_WATER_QUALITY.map((r) => (
            <Table.Tr key={r.time}>
              <Table.Td>{r.time}</Table.Td>
              <Table.Td ta="right">{r.backgroundNtu.toFixed(1)}</Table.Td>
              <Table.Td ta="right">{r.complianceNtu.toFixed(1)}</Table.Td>
              <Table.Td ta="right">
                {r.alert ? <Badge size="xs" color="red">Alert</Badge> : <Text size="xs" c="dimmed">—</Text>}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  )
}
