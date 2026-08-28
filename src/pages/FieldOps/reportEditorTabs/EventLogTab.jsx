import { useState } from 'react'
import { Box, Text, Table, Group, Button, Modal, TextInput, Select } from '@mantine/core'
import { IconPlus, IconPencil, IconTrash, IconAlertTriangle } from '@tabler/icons-react'
import { useEvents } from './hooks/useEvents'
import { useOperators } from '../../../hooks/useOperators'
import { useProjectAreas } from '../../../hooks/useProjectAreas'
import { usePicklist } from '../../../hooks/usePicklist'
import { useDelayCodes } from '../../../hooks/useDelayCodes'
import { useProjectDelayCodes } from '../../../hooks/useProjectDelayCodes'
import { useProjectAttachments } from '../../../hooks/useProjectAttachments'
import { useProjectLayers } from '../../../hooks/useProjectLayers'

// jfb_daily_activities still has no source field, so that column has
// nothing real to show yet — flagged rather than faked. Everything else
// (delay_code_id, area jsonb, pass_type, attachment_id, tsca, layer_id,
// notes) is real and, as of this pass, collectible through Insert/Edit —
// layer_id added 2026-08-27 alongside this form update.
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

function tscaLabel(tsca) {
  if (tsca === true) return 'Yes'
  if (tsca === false) return 'No'
  return '—'
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

// '' is the Select's own "no value" sentinel (Mantine Select can't take null
// as a controlled value) -- normalized to real null right before saving.
const EMPTY_FORM = {
  from: '',
  to: '',
  operatorId: null,
  delayCodeId: '',
  areaId: '',
  subAreaId: '',
  subSubAreaId: '',
  passType: '',
  attachmentId: '',
  tsca: '',
  layerId: '',
}

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

// area_id/sub_area_id/sub_sub_area_id -> the jsonb breadcrumb shape saved on
// jfb_daily_activities.area, omitting keys the cascade didn't reach.
function buildAreaJson(areaId, subAreaId, subSubAreaId) {
  if (!areaId) return null
  const out = { area_id: areaId }
  if (subAreaId) out.sub_area_id = subAreaId
  if (subSubAreaId) out.sub_sub_area_id = subSubAreaId
  return out
}

function tscaFromForm(v) {
  if (v === 'yes') return true
  if (v === 'no') return false
  return null
}
function tscaToForm(v) {
  if (v === true) return 'yes'
  if (v === false) return 'no'
  return ''
}

function payloadFromForm(f) {
  return {
    operator_id: f.operatorId,
    delay_code_id: f.delayCodeId === '__operational__' || f.delayCodeId === '' ? null : f.delayCodeId,
    area: buildAreaJson(f.areaId || null, f.subAreaId || null, f.subSubAreaId || null),
    pass_type: f.passType || null,
    attachment_id: f.attachmentId || null,
    tsca: tscaFromForm(f.tsca),
    layer_id: f.layerId || null,
  }
}

export default function EventLogTab({ project, report, equipment = [], selectedEquipmentId }) {
  const eventDate = report?.report_date
  const { events, create, update, remove } = useEvents(project?.id, eventDate)
  const { operators } = useOperators(project?.id)
  const { areas } = useProjectAreas(project?.id)
  const { labels: passTypeLabels, values: passTypeValues } = usePicklist('pkl-jfb-pass-type')
  const { delayCodes: masterDelayCodes } = useDelayCodes()
  const { projectDelayCodes } = useProjectDelayCodes(project?.id)
  const { attachments } = useProjectAttachments(project?.id)
  const { layers } = useProjectLayers(project?.id)

  const areaNameById = new Map(areas.map((a) => [a.id, a.name]))
  const masterDelayCodeById = new Map(masterDelayCodes.map((m) => [m.id, m]))
  const projectDelayCodeById = new Map(projectDelayCodes.map((r) => [r.id, r]))

  // Area cascade: level 1 = no parent; level 2/3 = children of the level above.
  const l1Areas = areas.filter((a) => !a.parent_id)
  const l2AreasFor = (l1Id) => areas.filter((a) => a.parent_id === l1Id)
  const l3AreasFor = (l2Id) => areas.filter((a) => a.parent_id === l2Id)

  // Category options: a synthetic "Operational" choice (delay_code_id = null,
  // i.e. productive time -- see useGohNoh.js's same convention) plus every
  // active project delay code, grouped the same way DelayCodesTab shows them.
  const delayCodeOptions = [
    { group: 'Operational', items: [{ value: '__operational__', label: 'Operational (no delay)' }] },
    {
      group: 'Delay',
      items: projectDelayCodes
        .filter((r) => r.active !== false)
        .map((r) => {
          const resolved = resolveDelayCode(r.id, projectDelayCodeById, masterDelayCodeById)
          return { value: r.id, label: resolved?.code ?? '(unnamed)' }
        }),
    },
  ]

  const multiLayer = layers.length > 1

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

  // Changing a higher area level clears the levels below it, same as the
  // non-native cascade.
  function setAreaLevel(level, value) {
    if (level === 1) setForm((f) => ({ ...f, areaId: value, subAreaId: '', subSubAreaId: '' }))
    else if (level === 2) setForm((f) => ({ ...f, subAreaId: value, subSubAreaId: '' }))
    else setForm((f) => ({ ...f, subSubAreaId: value }))
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
      start_date_time: start,
      end_date_time: end,
      ...payloadFromForm(form),
    })
    setInsertOpen(false)
  }

  function openEdit(row) {
    setEditRow(row)
    setForm({
      from: hhmm(row.start_date_time),
      to: hhmm(row.end_date_time),
      operatorId: row.operator_id ?? null,
      delayCodeId: row.delay_code_id ?? '__operational__',
      areaId: row.area?.area_id ?? '',
      subAreaId: row.area?.sub_area_id ?? '',
      subSubAreaId: row.area?.sub_sub_area_id ?? '',
      passType: row.pass_type ?? '',
      attachmentId: row.attachment_id ?? '',
      tsca: tscaToForm(row.tsca),
      layerId: row.layer_id ?? '',
    })
  }

  async function handleSaveEdit() {
    if (!editRow || !eventDate) return
    const { start, end } = eventTimestamps(eventDate, form.from, form.to)
    await update(editRow.id, { start_date_time: start, end_date_time: end, ...payloadFromForm(form) })
    setEditRow(null)
  }

  async function handleDelete() {
    if (!deleteRow) return
    await remove(deleteRow.id)
    setDeleteRow(null)
  }

  // Shared field set for both Insert and Edit -- same fields, same order, as
  // the non-native app's InsertTransitionForm.tsx / EditEventDialog.tsx.
  function FormFields() {
    const l2Options = form.areaId ? l2AreasFor(form.areaId) : []
    const l3Options = form.subAreaId ? l3AreasFor(form.subAreaId) : []
    return (
      <>
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
        <Select
          label="Category"
          data={delayCodeOptions}
          value={form.delayCodeId}
          onChange={(v) => setField('delayCodeId', v ?? '')}
          mb={10}
        />
        <Select
          label="Area"
          data={l1Areas.map((a) => ({ value: a.id, label: a.name }))}
          value={form.areaId || null}
          onChange={(v) => setAreaLevel(1, v ?? '')}
          clearable
          mb={10}
        />
        {l2Options.length > 0 && (
          <Select
            label="Sub-Area"
            data={l2Options.map((a) => ({ value: a.id, label: a.name }))}
            value={form.subAreaId || null}
            onChange={(v) => setAreaLevel(2, v ?? '')}
            clearable
            mb={10}
          />
        )}
        {l3Options.length > 0 && (
          <Select
            label="Sub-Sub-Area"
            data={l3Options.map((a) => ({ value: a.id, label: a.name }))}
            value={form.subSubAreaId || null}
            onChange={(v) => setAreaLevel(3, v ?? '')}
            clearable
            mb={10}
          />
        )}
        <Select
          label="Pass"
          data={passTypeValues.map((v) => ({ value: v, label: passTypeLabels[v] ?? v }))}
          value={form.passType || null}
          onChange={(v) => setField('passType', v ?? '')}
          clearable
          mb={10}
        />
        {multiLayer && (
          <Select
            label="Layer"
            data={layers.map((l) => ({ value: l.id, label: l.layer_name ?? l.name }))}
            value={form.layerId || null}
            onChange={(v) => setField('layerId', v ?? '')}
            clearable
            mb={10}
          />
        )}
        <Select
          label="Attachment"
          data={attachments.map((a) => ({ value: a.id, label: a.name }))}
          value={form.attachmentId || null}
          onChange={(v) => setField('attachmentId', v ?? '')}
          clearable
          mb={10}
        />
        {project?.is_tsca_zone_tracking && (
          <Select
            label="TSCA"
            data={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
            value={form.tsca || null}
            onChange={(v) => setField('tsca', v ?? '')}
            clearable
            mb={10}
          />
        )}
      </>
    )
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
              <Table.Td>{tscaLabel(e.tsca)}</Table.Td>
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

      {/* Insert modal — now offers the same real fields as the non-native
          app's InsertTransitionForm.tsx (Category/Area/Pass/Layer/Attachment/
          TSCA), added 2026-08-27. Still no Transition-vs-Operational/Delay
          mode toggle: jfb_daily_activities has no zero-duration transition-
          marker concept -- every row already carries its own area/pass/
          attachment/tsca directly, so there's nothing for that toggle to
          switch between here. */}
      <Modal key={insertKey} opened={insertOpen} onClose={() => setInsertOpen(false)} title={<Text fw={700} size="sm">Insert Event</Text>} size="sm">
        {FormFields()}
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setInsertOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleInsert} disabled={!form.from || !form.to} style={{ background: '#0F2744', border: 'none' }}>Insert</Button>
        </Group>
      </Modal>

      {/* Edit modal — same field set as Insert */}
      <Modal opened={!!editRow} onClose={() => setEditRow(null)} title={<Text fw={700} size="sm">Edit Event</Text>} size="sm">
        {FormFields()}
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
