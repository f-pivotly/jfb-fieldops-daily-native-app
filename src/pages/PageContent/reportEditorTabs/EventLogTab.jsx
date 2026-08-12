import { Box, SimpleGrid, Text, Table, Badge, Group } from '@mantine/core'
import { SAMPLE_EVENTS, SAMPLE_EVENT_TOTALS } from '../../../data/reportEditorSampleData'

const SOURCE_COLOR = { operator: 'blue', pe: 'grape', auto_gap: 'gray' }

export default function EventLogTab() {
  const t = SAMPLE_EVENT_TOTALS
  return (
    <Box>
      <Box withBorder p={16} mb={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
        <SimpleGrid cols={{ base: 2, sm: 5 }}>
          <Stat label="Shift start" value={t.shiftStart} />
          <Stat label="Shift end" value={t.shiftEnd} />
          <Stat label="Operational" value={`${t.operationalHours} h`} />
          <Stat label="Delay" value={`${t.delayHours} h`} />
          <Stat label="Shift" value={`${t.shiftHours} h`} />
        </SimpleGrid>
        <Text size="xs" c="green" mt={10}>✓ Operational + Delay = Shift</Text>
      </Box>

      <Table withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>From</Table.Th>
            <Table.Th>To</Table.Th>
            <Table.Th>Category</Table.Th>
            <Table.Th>Area</Table.Th>
            <Table.Th>Pass</Table.Th>
            <Table.Th>Operator</Table.Th>
            <Table.Th>Notes</Table.Th>
            <Table.Th>Source</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {SAMPLE_EVENTS.map((e) => (
            <Table.Tr key={e.id}>
              <Table.Td>{e.from}</Table.Td>
              <Table.Td>{e.to}</Table.Td>
              <Table.Td>{e.category}</Table.Td>
              <Table.Td>{e.area}</Table.Td>
              <Table.Td>{e.pass}</Table.Td>
              <Table.Td>{e.operator}</Table.Td>
              <Table.Td>{e.notes || '—'}</Table.Td>
              <Table.Td>
                <Badge size="xs" variant="light" color={SOURCE_COLOR[e.source]}>{e.source}</Badge>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  )
}

function Stat({ label, value }) {
  return (
    <Group gap={2} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <Text size="10px" tt="uppercase" c="dimmed">{label}</Text>
      <Text size="sm" fw={600}>{value}</Text>
    </Group>
  )
}
