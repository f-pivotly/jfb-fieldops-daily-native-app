import { Box, Text, SimpleGrid, Table, Badge, Stack, Group } from '@mantine/core'
import {
  SAMPLE_SAFETY_TENETS,
  SAMPLE_CREW,
  SAMPLE_CLIMATE,
  SAMPLE_SIGNATURES,
} from '../../../data/reportEditorSampleData'
import { SAMPLE_SITE_EQUIPMENT } from '../../../data/projectSettingsSampleData'

const TENET_COLOR = { pass: 'green', fail: 'red', na: 'gray' }

export default function SafetyTab() {
  return (
    <Stack gap="lg">
      <Section title="Daily Safety Updates">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          {SAMPLE_SAFETY_TENETS.map((t) => (
            <Group key={t.label} justify="space-between" p={8} style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 6 }}>
              <Text size="sm">{t.label}{t.detail ? ` — ${t.detail}` : ''}</Text>
              <Badge size="xs" color={TENET_COLOR[t.status]}>{t.status.toUpperCase()}</Badge>
            </Group>
          ))}
        </SimpleGrid>
      </Section>

      <Section title="Crew Summary">
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr><Table.Th>Category</Table.Th><Table.Th ta="right">Count</Table.Th><Table.Th ta="right">Hours</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {SAMPLE_CREW.map((c) => (
              <Table.Tr key={c.category}>
                <Table.Td>{c.category}</Table.Td>
                <Table.Td ta="right">{c.count}</Table.Td>
                <Table.Td ta="right">{c.hours}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Section>

      <Section title="Climate">
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Stat label="High / Low" value={`${SAMPLE_CLIMATE.tempHighF}° / ${SAMPLE_CLIMATE.tempLowF}°F`} />
          <Stat label="Precip today" value={`${SAMPLE_CLIMATE.precipTodayIn.toFixed(2)} in`} />
          <Stat label="Precip MTD" value={`${SAMPLE_CLIMATE.precipMtdIn.toFixed(2)} in`} />
          <Stat label="Precip PTD" value={`${SAMPLE_CLIMATE.precipPtdIn.toFixed(2)} in`} />
          <Stat label="Wind" value={SAMPLE_CLIMATE.wind} />
          <Stat label="Sky" value={SAMPLE_CLIMATE.sky} />
        </SimpleGrid>
      </Section>

      <Section title="Signature">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Box>
            <Text size="xs" c="dimmed" tt="uppercase">Report Preparer</Text>
            <Text size="sm" fw={500}>{SAMPLE_SIGNATURES.preparer.name}</Text>
            <Text size="xs" c="dimmed">{SAMPLE_SIGNATURES.preparer.signedAt}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed" tt="uppercase">SSHO</Text>
            <Text size="sm" fw={500} c={SAMPLE_SIGNATURES.sssho.signedAt ? undefined : 'dimmed'}>
              {SAMPLE_SIGNATURES.sssho.signedAt ? SAMPLE_SIGNATURES.sssho.name : 'Not yet signed'}
            </Text>
          </Box>
        </SimpleGrid>
      </Section>

      <Section title="Site Equipment">
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr><Table.Th>Equipment</Table.Th><Table.Th>Mobilized</Table.Th><Table.Th>Demobilized</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {SAMPLE_SITE_EQUIPMENT.map((e) => (
              <Table.Tr key={e.id}>
                <Table.Td>{e.name}</Table.Td>
                <Table.Td>{e.mobilized}</Table.Td>
                <Table.Td>{e.demobilized ?? '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Section>
    </Stack>
  )
}

function Section({ title, children }) {
  return (
    <Box>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>{title}</Text>
      {children}
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
