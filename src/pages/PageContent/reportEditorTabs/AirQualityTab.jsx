import { Table, Badge, Text, Box } from '@mantine/core'
import { SAMPLE_AIR_QUALITY } from '../../../data/reportEditorSampleData'

// Real AirQualityTab auto-pulls SGS SmartSense PM10 readings. This shows the
// same reading shape as a static sample table.
export default function AirQualityTab() {
  return (
    <Box>
      <Text size="xs" c="dimmed" mb={10}>Auto-pulled from SGS SmartSense (sample readings shown)</Text>
      <Table withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Time</Table.Th>
            <Table.Th ta="right">PM10 (µg/m³)</Table.Th>
            <Table.Th ta="right">Alert</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {SAMPLE_AIR_QUALITY.map((r) => (
            <Table.Tr key={r.time}>
              <Table.Td>{r.time}</Table.Td>
              <Table.Td ta="right">{r.pm10}</Table.Td>
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
