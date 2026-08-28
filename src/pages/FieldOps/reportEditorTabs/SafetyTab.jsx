import { Box, Text, SimpleGrid, Table, Badge, Stack, Group, Button, TextInput, NumberInput, FileButton } from '@mantine/core'
import { useState } from 'react'
import { IconPlus, IconTrash, IconSignature } from '@tabler/icons-react'

const TENET_COLOR = { pass: 'green', fail: 'red', na: 'gray' }

const SAFETY_TENETS_PLACEHOLDER = []
const PRIOR_DAY_CREW_PLACEHOLDER = []
const SITE_EQUIPMENT_PLACEHOLDER = []
const CLIMATE_PLACEHOLDER = {
  tempHighF: 0,
  tempLowF: 0,
  precipTodayIn: 0,
  precipMtdIn: 0,
  precipPtdIn: 0,
  wind: '',
  sky: '',
}
const SIGNATURES_PLACEHOLDER = {
  preparer: { name: '', signedAt: null },
  sssho: { name: '', signedAt: null },
}

export default function SafetyTab() {
  const [crew, setCrew] = useState([])
  const [prefillPreview, setPrefillPreview] = useState(false)
  const [signatureUrl, setSignatureUrl] = useState(null)

  const allBlank = crew.every((c) => !c.category && !c.count && !c.hours)

  function updateCrew(id, patch) {
    setCrew((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }
  function addCrew() {
    setCrew((prev) => [...prev, { id: `crew-${Date.now()}`, category: '', count: 0, hours: 0 }])
  }
  function removeCrew(id) {
    setCrew((prev) => prev.filter((c) => c.id !== id))
  }
  function acceptPrefill() {
    setCrew(PRIOR_DAY_CREW_PLACEHOLDER.map((c) => ({ ...c, id: `crew-${Date.now()}-${c.id}` })))
    setPrefillPreview(false)
  }
  function handleSignatureFile(file) {
    if (!file) return
    setSignatureUrl(URL.createObjectURL(file))
  }

  return (
    <Stack gap="lg">
      <Section title="Daily Safety Updates">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          {SAFETY_TENETS_PLACEHOLDER.map((t) => (
            <Group key={t.label} justify="space-between" p={8} style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 6 }}>
              <Text size="sm">{t.label}{t.detail ? ` — ${t.detail}` : ''}</Text>
              <Badge size="xs" color={TENET_COLOR[t.status]}>{t.status.toUpperCase()}</Badge>
            </Group>
          ))}
        </SimpleGrid>
      </Section>

      <Section title="Crew Summary">
        {allBlank && !prefillPreview && (
          <Text size="xs" c="#0F2744" fw={600} mb={8} onClick={() => setPrefillPreview(true)} style={{ cursor: 'pointer', display: 'inline-block' }}>
            Use crew from M/D
          </Text>
        )}
        {prefillPreview && (
          <Box mb={10} p={10} style={{ background: '#f5f6f8', border: '1px solid #e7ecf5', borderRadius: 6 }}>
            <Text size="10px" c="dimmed" mb={6} tt="uppercase">Most recent prior daily's crew</Text>
            <Stack gap={2} mb={8}>
              {PRIOR_DAY_CREW_PLACEHOLDER.map((c) => (
                <Text key={c.id} size="xs">{c.category} — {c.count} · {c.hours}h</Text>
              ))}
            </Stack>
            <Group gap={8}>
              <Button size="xs" onClick={acceptPrefill} style={{ background: '#0F2744', border: 'none' }}>Accept and insert</Button>
              <Button size="xs" variant="default" onClick={() => setPrefillPreview(false)}>Cancel</Button>
            </Group>
          </Box>
        )}
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr><Table.Th>Category</Table.Th><Table.Th ta="right">Count</Table.Th><Table.Th ta="right">Hours</Table.Th><Table.Th style={{ width: 40 }} /></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {crew.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td><TextInput size="xs" value={c.category} onChange={(e) => updateCrew(c.id, { category: e.currentTarget.value })} /></Table.Td>
                <Table.Td><NumberInput size="xs" hideControls value={c.count} onChange={(v) => updateCrew(c.id, { count: v })} /></Table.Td>
                <Table.Td><NumberInput size="xs" hideControls value={c.hours} onChange={(v) => updateCrew(c.id, { hours: v })} /></Table.Td>
                <Table.Td>
                  <Box onClick={() => removeCrew(c.id)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }}>
                    <IconTrash size={13} />
                  </Box>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Button size="xs" variant="default" mt={8} leftSection={<IconPlus size={11} />} onClick={addCrew}>Add crew</Button>
      </Section>

      <Section title="Climate">
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Stat label="High / Low" value={`${CLIMATE_PLACEHOLDER.tempHighF}° / ${CLIMATE_PLACEHOLDER.tempLowF}°F`} />
          <Stat label="Precip today" value={`${CLIMATE_PLACEHOLDER.precipTodayIn.toFixed(2)} in`} />
          <Stat label="Precip MTD" value={`${CLIMATE_PLACEHOLDER.precipMtdIn.toFixed(2)} in`} />
          <Stat label="Precip PTD" value={`${CLIMATE_PLACEHOLDER.precipPtdIn.toFixed(2)} in`} />
          <Stat label="Wind" value={CLIMATE_PLACEHOLDER.wind} />
          <Stat label="Sky" value={CLIMATE_PLACEHOLDER.sky} />
        </SimpleGrid>
      </Section>

      <Section title="Signature">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Box>
            <Text size="xs" c="dimmed" tt="uppercase">Report Preparer</Text>
            <Text size="sm" fw={500}>{SIGNATURES_PLACEHOLDER.preparer.name}</Text>
            <Text size="xs" c="dimmed" mb={8}>{SIGNATURES_PLACEHOLDER.preparer.signedAt}</Text>

            {signatureUrl ? (
              <Box>
                <img src={signatureUrl} alt="Signature" style={{ height: 40, display: 'block', marginBottom: 6 }} />
                <FileButton onChange={handleSignatureFile} accept="image/png,image/jpeg,image/webp">
                  {(props) => <Button {...props} size="xs" variant="default">Replace signature</Button>}
                </FileButton>
              </Box>
            ) : (
              <FileButton onChange={handleSignatureFile} accept="image/png,image/jpeg,image/webp">
                {(props) => (
                  <Button {...props} size="xs" variant="default" leftSection={<IconSignature size={12} />}>
                    Upload signature
                  </Button>
                )}
              </FileButton>
            )}
          </Box>
          <Box>
            <Text size="xs" c="dimmed" tt="uppercase">SSHO</Text>
            <Text size="sm" fw={500} c={SIGNATURES_PLACEHOLDER.sssho.signedAt ? undefined : 'dimmed'}>
              {SIGNATURES_PLACEHOLDER.sssho.signedAt ? SIGNATURES_PLACEHOLDER.sssho.name : 'Not yet signed'}
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
            {SITE_EQUIPMENT_PLACEHOLDER.map((e) => (
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
