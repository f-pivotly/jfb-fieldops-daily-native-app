import { useState } from 'react'
import { Box, SimpleGrid, Text, Table, Badge, Group, Button, Modal, TextInput, Select, Radio, Textarea } from '@mantine/core'
import { IconPlus, IconPencil, IconTrash, IconAlertTriangle } from '@tabler/icons-react'
import {
  SAMPLE_EVENTS,
  SAMPLE_EVENT_TOTALS,
  SAMPLE_TRANSITION_AREAS,
  SAMPLE_PASS_OPTIONS,
  SAMPLE_EVENT_CATEGORIES,
} from '../../../data/reportEditorSampleData'

const SOURCE_COLOR = { operator: 'blue', pe: 'grape', auto_gap: 'gray' }

const EMPTY_FORM = { from: '', to: '', category: '', area: '', pass: '', tsca: 'No', operator: '', notes: '' }

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function findGaps(events) {
  const sorted = [...events].sort((a, b) => toMinutes(a.from) - toMinutes(b.from))
  const gaps = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const end = toMinutes(sorted[i].to)
    const nextStart = toMinutes(sorted[i + 1].from)
    if (nextStart > end) gaps.push({ id: `gap-${sorted[i].id}`, from: sorted[i].to, to: sorted[i + 1].from })
  }
  return gaps
}

export default function EventLogTab() {
  const t = SAMPLE_EVENT_TOTALS
  const [events, setEvents] = useState(SAMPLE_EVENTS)
  const [deletedEvents, setDeletedEvents] = useState([])
  const [showDeleted, setShowDeleted] = useState(false)

  const [transitionOpen, setTransitionOpen] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [deleteRow, setDeleteRow] = useState(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)

  const gaps = findGaps(events)

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function openInsertTransition() {
    const lastTo = events.length ? [...events].sort((a, b) => toMinutes(a.from) - toMinutes(b.from)).at(-1).to : '06:00'
    setForm({ ...EMPTY_FORM, from: lastTo, to: lastTo, category: 'TRANSITION', area: SAMPLE_TRANSITION_AREAS[0], pass: SAMPLE_PASS_OPTIONS[0], operator: 'A. Trofka' })
    setTransitionOpen(true)
  }

  function openInsertForGap(gap) {
    setForm({ ...EMPTY_FORM, from: gap.from, to: gap.to, category: 'UNATTRIBUTED', area: SAMPLE_TRANSITION_AREAS[0], pass: SAMPLE_PASS_OPTIONS[0], operator: 'A. Trofka' })
    setTransitionOpen(true)
  }

  function handleInsert() {
    if (!form.from || !form.to || !form.category) return
    setEvents((prev) => [...prev, { id: `ev-${Date.now()}`, ...form, source: 'pe' }])
    setTransitionOpen(false)
  }

  function openEdit(row) {
    setEditRow(row)
    setForm({ from: row.from, to: row.to, category: row.category, area: row.area, pass: row.pass, tsca: row.tsca ?? 'No', operator: row.operator, notes: row.notes })
  }

  function handleSaveEdit() {
    if (!editRow) return
    setEvents((prev) => prev.map((e) => (e.id === editRow.id ? { ...e, ...form } : e)))
    setEditRow(null)
  }

  function handleDelete() {
    if (!deleteRow || deleteReason.trim().length < 3) return
    setEvents((prev) => prev.filter((e) => e.id !== deleteRow.id))
    setDeletedEvents((prev) => [...prev, { ...deleteRow, reason: deleteReason.trim() }])
    setDeleteRow(null)
    setDeleteReason('')
  }

  return (
    <Box>
      <Box p={16} mb={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
        <SimpleGrid cols={{ base: 2, sm: 5 }}>
          <Stat label="Shift start" value={t.shiftStart} />
          <Stat label="Shift end" value={t.shiftEnd} />
          <Stat label="Operational" value={`${t.operationalHours} h`} />
          <Stat label="Delay" value={`${t.delayHours} h`} />
          <Stat label="Shift" value={`${t.shiftHours} h`} />
        </SimpleGrid>
        <Text size="xs" c="green" mt={10}>✓ Operational + Delay = Shift</Text>
      </Box>

      {gaps.map((g) => (
        <Group
          key={g.id}
          justify="space-between"
          p={10}
          mb={10}
          style={{ background: '#fbf1dd', border: '1px solid #e6cb87', borderRadius: 6 }}
        >
          <Group gap={8}>
            <IconAlertTriangle size={14} color="#b5740a" />
            <Text size="xs" fw={600} c="#7a5206">
              Unaccounted hours: {g.from}–{g.to}
            </Text>
          </Group>
          <Button size="xs" variant="default" leftSection={<IconPlus size={11} />} onClick={() => openInsertForGap(g)}>
            Insert event
          </Button>
        </Group>
      ))}

      <Group justify="space-between" mb={8}>
        <Text size="xs" c="dimmed">{events.length} events</Text>
        <Group gap={10}>
          {deletedEvents.length > 0 && (
            <Text size="xs" onClick={() => setShowDeleted((v) => !v)} style={{ cursor: 'pointer', color: '#0F2744', fontWeight: 600 }}>
              {showDeleted ? 'Hide' : 'Show'} deleted ({deletedEvents.length})
            </Text>
          )}
          <Button size="xs" leftSection={<IconPlus size={12} />} onClick={openInsertTransition} style={{ background: '#0F2744', border: 'none' }}>
            Insert transition event
          </Button>
        </Group>
      </Group>

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
            <Table.Th style={{ width: 64 }} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {events.map((e) => (
            <Table.Tr key={e.id} style={e.category === 'UNATTRIBUTED' ? { background: '#fbf1dd' } : undefined}>
              <Table.Td>{e.from}</Table.Td>
              <Table.Td>{e.to}</Table.Td>
              <Table.Td>{e.category}</Table.Td>
              <Table.Td>{e.area}</Table.Td>
              <Table.Td>{e.pass}</Table.Td>
              <Table.Td>{e.operator}</Table.Td>
              <Table.Td>{e.notes || '—'}</Table.Td>
              <Table.Td>
                <Badge size="xs" variant="light" color={SOURCE_COLOR[e.source] ?? 'gray'}>{e.source}</Badge>
              </Table.Td>
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <Box onClick={() => openEdit(e)} style={{ cursor: 'pointer', color: '#888', display: 'flex' }} title="Edit">
                    <IconPencil size={13} />
                  </Box>
                  <Box onClick={() => setDeleteRow(e)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }} title="Delete">
                    <IconTrash size={13} />
                  </Box>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {showDeleted && deletedEvents.map((e) => (
            <Table.Tr key={e.id} style={{ opacity: 0.5, textDecoration: 'line-through' }}>
              <Table.Td>{e.from}</Table.Td>
              <Table.Td>{e.to}</Table.Td>
              <Table.Td>{e.category}</Table.Td>
              <Table.Td>{e.area}</Table.Td>
              <Table.Td>{e.pass}</Table.Td>
              <Table.Td>{e.operator}</Table.Td>
              <Table.Td colSpan={3}>
                <Text size="10px" c="dimmed" style={{ textDecoration: 'none' }}>Deleted — {e.reason}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {/* Insert transition / gap-fill modal */}
      <Modal opened={transitionOpen} onClose={() => setTransitionOpen(false)} title={<Text fw={700} size="sm">Insert Event</Text>} size="sm">
        <Group grow mb={10}>
          <TextInput label="From" type="time" value={form.from} onChange={(e) => setField('from', e.currentTarget.value)} />
          <TextInput label="To" type="time" value={form.to} onChange={(e) => setField('to', e.currentTarget.value)} />
        </Group>
        <Select label="Category" data={SAMPLE_EVENT_CATEGORIES.concat(['TRANSITION', 'UNATTRIBUTED'])} value={form.category} onChange={(v) => setField('category', v ?? '')} mb={10} />
        <Select label="Area" data={SAMPLE_TRANSITION_AREAS} value={form.area} onChange={(v) => setField('area', v ?? '')} mb={10} />
        <Select label="Pass" data={SAMPLE_PASS_OPTIONS} value={form.pass} onChange={(v) => setField('pass', v ?? '')} mb={10} />
        <Radio.Group label="TSCA" value={form.tsca} onChange={(v) => setField('tsca', v)} mb={10}>
          <Group gap={16} mt={4}>
            <Radio value="No" label="No" />
            <Radio value="Yes" label="Yes" />
          </Group>
        </Radio.Group>
        <Textarea label="Note" value={form.notes} onChange={(e) => setField('notes', e.currentTarget.value)} mb={16} minRows={2} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setTransitionOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleInsert} disabled={!form.from || !form.to || !form.category} style={{ background: '#0F2744', border: 'none' }}>Insert</Button>
        </Group>
      </Modal>

      {/* Edit event modal */}
      <Modal opened={!!editRow} onClose={() => setEditRow(null)} title={<Text fw={700} size="sm">Edit Event</Text>} size="sm">
        <Group grow mb={10}>
          <TextInput label="From" type="time" value={form.from} onChange={(e) => setField('from', e.currentTarget.value)} />
          <TextInput label="To" type="time" value={form.to} onChange={(e) => setField('to', e.currentTarget.value)} />
        </Group>
        <Select label="Category" data={SAMPLE_EVENT_CATEGORIES.concat(['TRANSITION', 'UNATTRIBUTED'])} value={form.category} onChange={(v) => setField('category', v ?? '')} mb={10} />
        <Select label="Area" data={SAMPLE_TRANSITION_AREAS.concat(['—'])} value={form.area} onChange={(v) => setField('area', v ?? '')} mb={10} />
        <Select label="Pass" data={SAMPLE_PASS_OPTIONS.concat(['—'])} value={form.pass} onChange={(v) => setField('pass', v ?? '')} mb={10} />
        <TextInput label="Operator" value={form.operator} onChange={(e) => setField('operator', e.currentTarget.value)} mb={10} />
        <Textarea label="Notes" value={form.notes} onChange={(e) => setField('notes', e.currentTarget.value)} mb={16} minRows={2} />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setEditRow(null)}>Cancel</Button>
          <Button size="xs" onClick={handleSaveEdit} style={{ background: '#0F2744', border: 'none' }}>Save</Button>
        </Group>
      </Modal>

      {/* Delete event modal — requires a reason, matches the real app's soft-delete audit trail */}
      <Modal opened={!!deleteRow} onClose={() => { setDeleteRow(null); setDeleteReason('') }} title={<Text fw={700} size="sm">Delete Event</Text>} size="sm">
        <Text size="sm" mb={10}>
          {deleteRow ? `${deleteRow.from}–${deleteRow.to} · ${deleteRow.category}` : ''}
        </Text>
        <Textarea
          label="Reason (required)"
          placeholder="Why is this event being removed?"
          value={deleteReason}
          onChange={(e) => setDeleteReason(e.currentTarget.value)}
          minRows={2}
          mb={16}
        />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => { setDeleteRow(null); setDeleteReason('') }}>Cancel</Button>
          <Button size="xs" color="red" onClick={handleDelete} disabled={deleteReason.trim().length < 3}>Delete</Button>
        </Group>
      </Modal>
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
