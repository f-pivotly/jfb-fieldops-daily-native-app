import { useState } from 'react'
import { Box, Text, Table, Group, Button, Modal, TextInput, Select } from '@mantine/core'
import { IconPlus, IconPencil, IconTrash, IconAlertTriangle } from '@tabler/icons-react'
import { useEvents } from '../../../hooks/useEvents'
import { useOperators } from '../../../hooks/useOperators'
import { useProjectAreas } from '../../../hooks/useProjectAreas'
import { usePicklist } from '../../../hooks/usePicklist'
import { useDelayCodes } from '../../../hooks/useDelayCodes'
import { useProjectDelayCodes } from '../../../hooks/useProjectDelayCodes'

// jfb_daily_activities still has no tsca/source fields, so those two columns
// have nothing real to show yet — flagged rather than faked. Category/Area/
// Pass/Notes are real now (delay_code_id, area jsonb, pass_type, notes).
const SAMPLE = '(sampleData)'

// A jfb_project_delay_codes row either points at a master code (category/code
// come from jfb_delay_codes) or is a project-specific custom code with no
// master match (those fields live on the row itself) -- same resolution as
// DelayCodesTab.jsx.
function resolveDelayCode(delayCodeId, projectDelayCodeById, masterDelayCodeById) {
  if (!delayCodeId) return null
  const row = projectDelayCodeById.get(delayCodeId)
  if (!row) return null
  const master = row.delay_code_id ? masterDelayCodeById.get(row.delay_code_id) : null
  return {
    category: master ? master.category : row.category,
    code: master ? master.code : row.code,
  }
}

// area is a jsonb breadcrumb ({area_id, sub_area_id, sub_sub_area_id}) since a
// project's area hierarchy (jfb_project_area_levels) can be 1-3 levels deep.
function resolveArea(area, areaNameById) {
  if (!area) return '—'
  const parts = [area.area_id, area.sub_area_id, area.sub_sub_area_id]
    .filter(Boolean)
    .map((id) => areaNameById.get(id))
    .filter(Boolean)
  return parts.length ? parts.join(' / ') : '—'
}

const EMPTY_FORM = { from: '', to: '', operatorId: null }

function hhmm(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Combines the report's date with a form's HH:MM into a local ISO timestamp.
// Rolls the end time to the next calendar day when earlier than the start
// time, so overnight shifts (e.g. 14:00 -> 02:00) work.
function eventTimestamps(dateISO, fromHHMM, toHHMM) {
  if (!dateISO || !fromHHMM || !toHHMM) return { start: null, end: null }
  const start = new Date(`${dateISO}T${fromHHMM}:00`)
  let end = new Date(`${dateISO}T${toHHMM}:00`)
  if (end < start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function fmtDuration(startISO, endISO) {
  if (!startISO || !endISO) return '—'
  const ms = new Date(endISO) - new Date(startISO)
  if (ms <= 0) return '—'
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function findGaps(sortedEvents) {
  const gaps = []
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const end = new Date(sortedEvents[i].end_date_time)
    const nextStart = new Date(sortedEvents[i + 1].start_date_time)
    if (nextStart > end) {
      gaps.push({ id: `gap-${sortedEvents[i].id}`, fromISO: sortedEvents[i].end_date_time, toISO: sortedEvents[i + 1].start_date_time })
    }
  }
  return gaps
}

export default function EventLogTab({ project, report, equipment = [], selectedEquipmentId }) {
  const eventDate = report?.report_date
  const { events, create, update, remove } = useEvents(project?.id, eventDate)
  const { operators } = useOperators(project?.id)
  const { areas } = useProjectAreas(project?.id)
  const { labels: passTypeLabels } = usePicklist('pkl-jfb-pass-type')
  const { delayCodes: masterDelayCodes } = useDelayCodes()
  const { projectDelayCodes } = useProjectDelayCodes(project?.id)

  const areaNameById = new Map(areas.map((a) => [a.id, a.name]))
  const masterDelayCodeById = new Map(masterDelayCodes.map((m) => [m.id, m]))
  const projectDelayCodeById = new Map(projectDelayCodes.map((r) => [r.id, r]))

  const sorted = events
    .filter((e) => e.equipment_id === selectedEquipmentId)
    .sort((a, b) => new Date(a.start_date_time) - new Date(b.start_date_time))
  const gaps = findGaps(sorted)
  const equipmentName = equipment.find((e) => e.id === selectedEquipmentId)?.name

  const [insertOpen, setInsertOpen] = useState(false)
  const [insertKey, setInsertKey] = useState(0)
  const [editRow, setEditRow] = useState(null)
  const [deleteRow, setDeleteRow] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function openInsert(defaults) {
    setForm({ ...EMPTY_FORM, ...defaults })
    setInsertKey((k) => k + 1)
    setInsertOpen(true)
  }

  function openInsertNext() {
    const last = sorted.at(-1)
    const lastTo = last ? hhmm(last.end_date_time) : '06:00'
    openInsert({ from: lastTo, to: lastTo, operatorId: last?.operator_id ?? operators[0]?.id ?? null })
  }

  function openInsertForGap(gap) {
    openInsert({ from: hhmm(gap.fromISO), to: hhmm(gap.toISO), operatorId: operators[0]?.id ?? null })
  }

  async function handleInsert() {
    if (!form.from || !form.to || !project || !eventDate) return
    const { start, end } = eventTimestamps(eventDate, form.from, form.to)
    await create({
      project_id: project.id,
      equipment_id: selectedEquipmentId,
      operator_id: form.operatorId,
      start_date_time: start,
      end_date_time: end,
    })
    setInsertOpen(false)
  }

  function openEdit(row) {
    setEditRow(row)
    setForm({ from: hhmm(row.start_date_time), to: hhmm(row.end_date_time), operatorId: row.operator_id ?? null })
  }

  async function handleSaveEdit() {
    if (!editRow || !eventDate) return
    const { start, end } = eventTimestamps(eventDate, form.from, form.to)
    await update(editRow.id, { operator_id: form.operatorId, start_date_time: start, end_date_time: end })
    setEditRow(null)
  }

  async function handleDelete() {
    if (!deleteRow) return
    await remove(deleteRow.id)
    setDeleteRow(null)
  }

  return (
    <Box>
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
              Unaccounted hours: {hhmm(g.fromISO)}–{hhmm(g.toISO)}
            </Text>
          </Group>
          <Button size="xs" variant="default" leftSection={<IconPlus size={11} />} onClick={() => openInsertForGap(g)}>
            Insert event
          </Button>
        </Group>
      ))}

      <Group justify="space-between" mb={8}>
        <Text size="xs" c="dimmed">
          {sorted.length} events{equipmentName ? ` · ${equipmentName}` : ''}
        </Text>
        <Button size="xs" leftSection={<IconPlus size={12} />} onClick={openInsertNext} style={{ background: '#0F2744', border: 'none' }}>
          Insert event
        </Button>
      </Group>

      <Table withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>#</Table.Th>
            <Table.Th>From</Table.Th>
            <Table.Th>To</Table.Th>
            <Table.Th>Dur</Table.Th>
            <Table.Th>Category</Table.Th>
            <Table.Th>Area</Table.Th>
            <Table.Th>Pass</Table.Th>
            <Table.Th>TSCA</Table.Th>
            <Table.Th>Operator</Table.Th>
            <Table.Th>Notes</Table.Th>
            <Table.Th>Source</Table.Th>
            <Table.Th style={{ width: 64 }} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={12}>
                <Text size="xs" c="dimmed" ta="center" py={12}>No events yet.</Text>
              </Table.Td>
            </Table.Tr>
          )}
          {sorted.map((e, i) => {
            const delayCode = resolveDelayCode(e.delay_code_id, projectDelayCodeById, masterDelayCodeById)
            return (
            <Table.Tr key={e.id}>
              <Table.Td>{i + 1}</Table.Td>
              <Table.Td>{hhmm(e.start_date_time)}</Table.Td>
              <Table.Td>{hhmm(e.end_date_time)}</Table.Td>
              <Table.Td>{fmtDuration(e.start_date_time, e.end_date_time)}</Table.Td>
              <Table.Td>{delayCode?.code ?? '—'}</Table.Td>
              <Table.Td>{resolveArea(e.area, areaNameById)}</Table.Td>
              <Table.Td>{e.pass_type ? (passTypeLabels[e.pass_type] ?? e.pass_type) : '—'}</Table.Td>
              <Table.Td c="dimmed">{SAMPLE}</Table.Td>
              <Table.Td>{operators.find((o) => o.id === e.operator_id)?.name ?? '—'}</Table.Td>
              <Table.Td>{e.notes || '—'}</Table.Td>
              <Table.Td c="dimmed">{SAMPLE}</Table.Td>
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
            )
          })}
        </Table.Tbody>
      </Table>

      {/* Insert modal — From/To/Operator are the only fields collected here.
          Category/Area/Pass/Notes now have real columns (populated from the
          field app's own tap/selection), but this admin form doesn't offer
          setting them manually -- it's for correcting time ranges, not
          authoring a delay/production event from scratch. TSCA still has no
          column at all. */}
      <Modal key={insertKey} opened={insertOpen} onClose={() => setInsertOpen(false)} title={<Text fw={700} size="sm">Insert Event</Text>} size="sm">
        <Group grow mb={10}>
          <TextInput label="From" type="time" value={form.from} onChange={(e) => setField('from', e.currentTarget.value)} />
          <TextInput label="To" type="time" value={form.to} onChange={(e) => setField('to', e.currentTarget.value)} />
        </Group>
        <Select
          label="Operator"
          data={operators.map((o) => ({ value: o.id, label: o.name }))}
          value={form.operatorId}
          onChange={(v) => setField('operatorId', v)}
          mb={10}
        />
        <Text size="10px" c="dimmed" mb={16}>
          Category, Area, Pass, and Notes come from the field app's own selection — this form only edits the time range and operator.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setInsertOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleInsert} disabled={!form.from || !form.to} style={{ background: '#0F2744', border: 'none' }}>Insert</Button>
        </Group>
      </Modal>

      {/* Edit modal — same real-field-only scope as Insert */}
      <Modal opened={!!editRow} onClose={() => setEditRow(null)} title={<Text fw={700} size="sm">Edit Event</Text>} size="sm">
        <Group grow mb={10}>
          <TextInput label="From" type="time" value={form.from} onChange={(e) => setField('from', e.currentTarget.value)} />
          <TextInput label="To" type="time" value={form.to} onChange={(e) => setField('to', e.currentTarget.value)} />
        </Group>
        <Select
          label="Operator"
          data={operators.map((o) => ({ value: o.id, label: o.name }))}
          value={form.operatorId}
          onChange={(v) => setField('operatorId', v)}
          mb={16}
        />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setEditRow(null)}>Cancel</Button>
          <Button size="xs" onClick={handleSaveEdit} style={{ background: '#0F2744', border: 'none' }}>Save</Button>
        </Group>
      </Modal>

      {/* Delete — hard delete via the domain's remove(); no soft-delete/audit
          table exists (jfb_event_deletions was reverted), so no reason field. */}
      <Modal opened={!!deleteRow} onClose={() => setDeleteRow(null)} title={<Text fw={700} size="sm">Delete Event</Text>} size="sm">
        <Text size="sm" mb={16}>
          {deleteRow ? `Delete the ${hhmm(deleteRow.start_date_time)}–${hhmm(deleteRow.end_date_time)} event? This can't be undone.` : ''}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setDeleteRow(null)}>Cancel</Button>
          <Button size="xs" color="red" onClick={handleDelete}>Delete</Button>
        </Group>
      </Modal>
    </Box>
  )
}
