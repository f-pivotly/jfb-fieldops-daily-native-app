import { Box, Table, TextInput, Text, SegmentedControl, Group, Button, NumberInput } from '@mantine/core'
import { useState } from 'react'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import {
  SAMPLE_PRODUCTION_ROWS,
  SAMPLE_PRODUCTION_TOTALS,
  SAMPLE_CAPPING_ROWS,
  SAMPLE_CAPPING_TOTALS,
  SAMPLE_FLOW_STATS,
  SAMPLE_PIPE_LENGTHS,
} from '../../../data/reportEditorSampleData'

export default function ProductionStatsTab() {
  const [mode, setMode] = useState('dredging')

  return (
    <Box>
      <SegmentedControl
        value={mode}
        onChange={setMode}
        data={[{ label: 'Dredging', value: 'dredging' }, { label: 'Capping', value: 'capping' }]}
        size="xs"
        mb={16}
      />
      {mode === 'dredging' ? <DredgingTable /> : <CappingTable />}
      {mode === 'dredging' && <FlowStatsPanel />}
    </Box>
  )
}

function DredgingTable() {
  const [rows, setRows] = useState(SAMPLE_PRODUCTION_ROWS)
  const t = SAMPLE_PRODUCTION_TOTALS

  function update(key, field, raw) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: raw === '' ? null : Number(raw) } : r)))
  }

  return (
    <Table withTableBorder verticalSpacing="xs" fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Area</Table.Th>
          <Table.Th>Pass</Table.Th>
          <Table.Th ta="right">GOH</Table.Th>
          <Table.Th ta="right">NOH</Table.Th>
          <Table.Th ta="right">CY</Table.Th>
          <Table.Th ta="right">SF</Table.Th>
          <Table.Th ta="right">Avg Face ft</Table.Th>
          <Table.Th>Notes</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.key}>
            <Table.Td>{r.area}</Table.Td>
            <Table.Td>{r.pass}</Table.Td>
            <Table.Td ta="right">{r.goh.toFixed(2)}</Table.Td>
            <Table.Td ta="right">{r.noh.toFixed(2)}</Table.Td>
            <Table.Td>
              <TextInput size="xs" ta="right" value={r.cy ?? ''} onChange={(e) => update(r.key, 'cy', e.currentTarget.value)} />
            </Table.Td>
            <Table.Td>
              <TextInput size="xs" value={r.sf ?? ''} onChange={(e) => update(r.key, 'sf', e.currentTarget.value)} />
            </Table.Td>
            <Table.Td ta="right">
              <Text size="sm" c="dimmed">{r.avgFace ?? '—'}</Text>
            </Table.Td>
            <Table.Td>
              <TextInput size="xs" value={r.notes} onChange={(e) => update(r.key, 'notes', e.currentTarget.value)} />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr>
          <Table.Th colSpan={2}>Totals</Table.Th>
          <Table.Th ta="right">{t.goh.toFixed(2)}</Table.Th>
          <Table.Th ta="right">{t.noh.toFixed(2)}</Table.Th>
          <Table.Th ta="right">{t.cy}</Table.Th>
          <Table.Th ta="right">{t.sf}</Table.Th>
          <Table.Th ta="right">{t.avgFace}</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  )
}

function CappingTable() {
  const [rows, setRows] = useState(SAMPLE_CAPPING_ROWS)
  const t = SAMPLE_CAPPING_TOTALS

  function update(key, field, raw) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: raw === '' ? null : Number(raw) } : r)))
  }

  return (
    <Table withTableBorder verticalSpacing="xs" fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Area</Table.Th>
          <Table.Th>Layer</Table.Th>
          <Table.Th ta="right">Tons placed</Table.Th>
          <Table.Th ta="right">Dry tons</Table.Th>
          <Table.Th ta="right">Acres</Table.Th>
          <Table.Th>Material</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.key}>
            <Table.Td>{r.area}</Table.Td>
            <Table.Td>{r.layer}</Table.Td>
            <Table.Td>
              <TextInput size="xs" ta="right" value={r.tonsPlaced ?? ''} onChange={(e) => update(r.key, 'tonsPlaced', e.currentTarget.value)} />
            </Table.Td>
            <Table.Td>
              <TextInput size="xs" ta="right" value={r.dryTons ?? ''} onChange={(e) => update(r.key, 'dryTons', e.currentTarget.value)} />
            </Table.Td>
            <Table.Td>
              <TextInput size="xs" ta="right" value={r.acres ?? ''} onChange={(e) => update(r.key, 'acres', e.currentTarget.value)} />
            </Table.Td>
            <Table.Td>{r.material}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr>
          <Table.Th colSpan={2}>Totals</Table.Th>
          <Table.Th ta="right">{t.tonsPlaced}</Table.Th>
          <Table.Th ta="right">{t.dryTons}</Table.Th>
          <Table.Th ta="right">{t.acres}</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  )
}

function FlowStatsPanel() {
  const [diameter, setDiameter] = useState(SAMPLE_FLOW_STATS.pipeDiameterIn)
  const [velocity, setVelocity] = useState(SAMPLE_FLOW_STATS.avgVelocityFps)
  const [segments, setSegments] = useState(SAMPLE_PIPE_LENGTHS)

  // Q (GPM) = V x pi x (d/24)^2 x 448.831 — same formula the real app uses.
  const flowRateGpm = diameter && velocity ? velocity * Math.PI * (diameter / 24) ** 2 * 448.831 : null
  const dailyTotalGal = flowRateGpm ? flowRateGpm * SAMPLE_FLOW_STATS.noh * 60 : null
  const totalPipeFt = segments.reduce((sum, s) => sum + (s.lengthFt || 0), 0)

  function addSegment() {
    setSegments((prev) => [...prev, { id: `pl-${Date.now()}`, name: '', lengthFt: 0 }])
  }
  function updateSegment(id, field, value) {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }
  function removeSegment(id) {
    setSegments((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <Box mt={20} p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
      <Text fw={600} size="sm" mb={10}>Flow Stats</Text>
      <Group grow mb={10} align="flex-end">
        <NumberInput label="Pipe inside diameter (in)" hideControls value={diameter} onChange={setDiameter} />
        <NumberInput label="Avg velocity (ft/s)" hideControls value={velocity} onChange={setVelocity} />
        <Box>
          <Text size="xs" c="dimmed" mb={4}>Avg flow rate (GPM)</Text>
          <Text size="sm" fw={600}>{flowRateGpm ? flowRateGpm.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</Text>
        </Box>
        <Box>
          <Text size="xs" c="dimmed" mb={4}>Daily total (gal)</Text>
          <Text size="sm" fw={600}>{dailyTotalGal ? dailyTotalGal.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</Text>
        </Box>
      </Group>
      <Text size="10px" c="dimmed" mb={16}>Enter pipe diameter + velocity; flow rate and daily total compute automatically.</Text>

      <Group justify="space-between" mb={8}>
        <Text fw={600} size="sm">Pipe Lengths</Text>
        <Button size="xs" variant="default" leftSection={<IconPlus size={11} />} onClick={addSegment}>Add segment</Button>
      </Group>
      {segments.map((s) => (
        <Group key={s.id} gap={8} mb={6} wrap="nowrap">
          <TextInput size="xs" placeholder="Segment name" value={s.name} onChange={(e) => updateSegment(s.id, 'name', e.currentTarget.value)} style={{ flex: 1 }} />
          <NumberInput size="xs" placeholder="Length (ft)" hideControls value={s.lengthFt} onChange={(v) => updateSegment(s.id, 'lengthFt', v)} w={120} />
          <Box onClick={() => removeSegment(s.id)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }}>
            <IconTrash size={13} />
          </Box>
        </Group>
      ))}
      <Text size="xs" c="dimmed" mt={4}>Total pipe: {totalPipeFt.toLocaleString()} ft</Text>
    </Box>
  )
}
