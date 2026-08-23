import { Table, TextInput, Text, Badge, Box, Group, Button, Modal, Select, Stack, Switch } from '@mantine/core'
import { useState } from 'react'
import { IconSettings, IconTrash } from '@tabler/icons-react'

export default function MetricsTab() {
  const [rows, setRows] = useState([])
  const [managerOpen, setManagerOpen] = useState(false)
  const visible = rows.filter((r) => !r.hidden)

  return (
    <Box>
      <Group justify="flex-end" mb={10}>
        <Button size="xs" variant="default" leftSection={<IconSettings size={12} />} onClick={() => setManagerOpen(true)}>
          Manage metrics
        </Button>
      </Group>

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
          {visible.map((r) => (
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

      <MetricsManagerDialog opened={managerOpen} onClose={() => setManagerOpen(false)} rows={rows} setRows={setRows} />
    </Box>
  )
}

function MetricsManagerDialog({ opened, onClose, rows, setRows }) {
  const [newLabel, setNewLabel] = useState('')

  function update(key, patch) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function move(index, dir) {
    setRows((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) {
        return prev
      }
      const next = [...prev]
      next[index] = prev[target]
      next[target] = prev[index]
      return next
    })
  }
  function remove(key) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }
  function addMetric() {
    if (!newLabel.trim()) return
    setRows((prev) => [
      ...prev,
      { key: `metric-${Date.now()}`, label: newLabel.trim(), source: 'Manual', autoKind: null, unit: '', day: 0, week: 0, total: 0, hidden: false },
    ])
    setNewLabel('')
  }
  function setSource(key, source) {
    if (source === 'Manual') update(key, { source: 'Manual', autoKind: null })
    else update(key, { source: 'Auto', autoKind: source })
  }

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700} size="sm">Manage Metrics</Text>} size="lg">
      <Stack gap={10} mb={16}>
        {rows.map((r, i) => (
          <Group key={r.key} gap={8} wrap="nowrap" align="flex-end">
            <TextInput size="xs" label="Label" value={r.label} onChange={(e) => update(r.key, { label: e.currentTarget.value })} style={{ flex: 1.4 }} />
            <Select
              size="xs"
              label="Source"
              data={[{ value: 'Manual', label: 'Manual' }]}
              value={r.source === 'Manual' ? 'Manual' : r.autoKind}
              onChange={(v) => setSource(r.key, v ?? 'Manual')}
              style={{ flex: 1.3 }}
            />
            <TextInput size="xs" label="Unit" value={r.unit} onChange={(e) => update(r.key, { unit: e.currentTarget.value })} w={70} />
            <Switch size="xs" mb={6} checked={!r.hidden} onChange={() => update(r.key, { hidden: !r.hidden })} label="Visible" />
            <Button size="xs" variant="subtle" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
            <Button size="xs" variant="subtle" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>↓</Button>
            <Box onClick={() => remove(r.key)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex', paddingBottom: 8 }}>
              <IconTrash size={13} />
            </Box>
          </Group>
        ))}
      </Stack>
      <Group gap={8}>
        <TextInput size="xs" placeholder="New metric label" value={newLabel} onChange={(e) => setNewLabel(e.currentTarget.value)} style={{ flex: 1 }} />
        <Button size="xs" onClick={addMetric} disabled={!newLabel.trim()} style={{ background: '#0F2744', border: 'none' }}>Add</Button>
      </Group>
      <Group justify="flex-end" mt={16}>
        <Button size="xs" onClick={onClose} style={{ background: '#0F2744', border: 'none' }}>Done</Button>
      </Group>
    </Modal>
  )
}
