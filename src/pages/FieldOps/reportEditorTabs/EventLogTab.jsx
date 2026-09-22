import { useState } from 'react'
import { Box, Text, Table, Group, Button, Checkbox, Modal, TextInput, Textarea, Select, Switch, Badge, SimpleGrid } from '@mantine/core'
import { IconPlus, IconPencil, IconTrash, IconAlertTriangle, IconCheck, IconFlag } from '@tabler/icons-react'
import { useEvents } from '../../../hooks/production/useEvents'
import { useFieldOpsAction } from '../../../contexts/fieldOpsAccessContext'
import { useOperators } from '../../../hooks/production/useOperators'
import { useProjectAreas } from '../../../hooks/project/useProjectAreas'
import { usePicklist } from '../../../hooks/core/usePicklist'
import { useDelayCodes } from '../../../hooks/production/useDelayCodes'
import { useProjectDelayCodes } from '../../../hooks/production/useProjectDelayCodes'
import { useProjectAttachments } from '../../../hooks/project/useProjectAttachments'
import { useProjectLayers } from '../../../hooks/capping/useProjectLayers'
import { useWorkTypes } from '../../../hooks/project/useWorkTypes'
import { equipmentWorkType, activeCategoryLabel } from '../lib/workType'
import { UNATTRIBUTED_CATEGORY, findEventGaps, shiftTotals, fmtDurationMs, isUnattributed } from '../lib/eventTotals'
import { hhmm24 as hhmm } from '../../../lib/reportDates'
import { browserTimeZone } from '../../../lib/reportTz'
import { computeAreaFillTargets } from '../../../lib/eventAreaFill'
import { WARNING_BG } from './components/WarningBanner'

const SAMPLE = '(sampleData)'

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

function resolveArea(area, areaNameById) {
  if (!area) return '—'
  const parts = [area.area_id, area.sub_area_id, area.sub_sub_area_id]
    .filter(Boolean)
    .map((id) => areaNameById.get(id))
    .filter(Boolean)
  return parts.length ? parts.join(' / ') : '—'
}

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
  notes: '',
}

function hhmmLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

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
    notes: f.notes?.trim() ? f.notes.trim() : null,
  }
}

function ShiftStat({ label, value }) {
  return (
    <Box>
      <Text size="10px" c="#9CA3AF" style={{ textTransform: 'uppercase', letterSpacing: '0.025em' }}>{label}</Text>
      <Text size="sm" fw={600} c="#111827" mt={2}>{value}</Text>
    </Box>
  )
}

export default function EventLogTab({ project, report, equipment = [], selectedEquipmentId }) {
  const eventDate = report?.report_date
  const canViewDeletedEvents = useFieldOpsAction('view_deleted_events')
  const [showDeleted, setShowDeleted] = useState(false)
  const { events, create, update, remove } = useEvents(project?.id, eventDate, {
    includeDeleted: showDeleted && canViewDeletedEvents,
  })
  const { operators } = useOperators(project?.id)
  const { areas } = useProjectAreas(project?.id)
  const { labels: passTypeLabels, values: passTypeValues } = usePicklist('pkl-jfb-pass-type')
  const { delayCodes: masterDelayCodes } = useDelayCodes()
  const { projectDelayCodes } = useProjectDelayCodes(project?.id)
  const { attachments } = useProjectAttachments(project?.id)
  const { layers } = useProjectLayers(project?.id)
  const { workTypes } = useWorkTypes()

  const areaNameById = new Map(areas.map((a) => [a.id, a.name]))
  const masterDelayCodeById = new Map(masterDelayCodes.map((m) => [m.id, m]))
  const projectDelayCodeById = new Map(projectDelayCodes.map((r) => [r.id, r]))

  const selectedEquipment = equipment.find((e) => e.id === selectedEquipmentId) ?? null
  const workType = equipmentWorkType(project, selectedEquipment, eventDate)
  const workTypeId = workTypes.find((w) => w.name === workType)?.id ?? null

  function effectiveDelayWorkTypeId(r) {
    const master = r.delay_code_id ? masterDelayCodeById.get(r.delay_code_id) : null
    return (master ? master.work_type_id : r.work_type_id) ?? null
  }

  function resolveCategoryForForm(f) {
    if (f.delayCodeId && f.delayCodeId !== '__operational__') {
      return resolveDelayCode(f.delayCodeId, projectDelayCodeById, masterDelayCodeById)?.code ?? null
    }
    return activeCategoryLabel(project, selectedEquipment, eventDate)
  }

  const l1Areas = areas.filter((a) => !a.parent_id)
  const l2AreasFor = (l1Id) => areas.filter((a) => a.parent_id === l1Id)
  const l3AreasFor = (l2Id) => areas.filter((a) => a.parent_id === l2Id)

  const delayCodeOptions = [
    { group: 'Operational', items: [{ value: '__operational__', label: 'Operational (no delay)' }] },
    {
      group: 'Delay',
      items: projectDelayCodes
        .filter((r) => r.active !== false)
        .filter((r) => {
          const wtId = effectiveDelayWorkTypeId(r)
          return wtId == null || wtId === workTypeId
        })
        .map((r) => {
          const resolved = resolveDelayCode(r.id, projectDelayCodeById, masterDelayCodeById)
          return { value: r.id, label: resolved?.code ?? '(unnamed)' }
        }),
    },
  ]

  const multiLayer = layers.length > 1

  const equipmentEvents = events.filter((e) => e.equipment_id === selectedEquipmentId)
  const activeSorted = equipmentEvents
    .filter((e) => !e.is_deleted)
    .sort((a, b) => new Date(a.start_date_time) - new Date(b.start_date_time))
  const sorted = (showDeleted && canViewDeletedEvents ? equipmentEvents : activeSorted)
    .slice()
    .sort((a, b) => new Date(a.start_date_time) - new Date(b.start_date_time))
  const gaps = findEventGaps(activeSorted)
  const gapAfterId = new Map(gaps.map((g) => [g.prevId, g]))
  const totals = shiftTotals(activeSorted)
  const unattributedCount = activeSorted.filter(isUnattributed).length
  const equipmentName = equipment.find((e) => e.id === selectedEquipmentId)?.name

  const [insertOpen, setInsertOpen] = useState(false)
  const [insertKey, setInsertKey] = useState(0)
  const [editRow, setEditRow] = useState(null)
  const [fillDown, setFillDown] = useState(true)
  const [fillError, setFillError] = useState(null)
  const fillTargets = editRow ? computeAreaFillTargets(activeSorted, editRow.id) : []
  const [deleteRow, setDeleteRow] = useState(null)
  const [hoverStrip, setHoverStrip] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

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

  function contextFrom(row) {
    if (!row) return {}
    return {
      operatorId: row.operator_id ?? null,
      areaId: row.area?.area_id ?? '',
      subAreaId: row.area?.sub_area_id ?? '',
      subSubAreaId: row.area?.sub_sub_area_id ?? '',
      passType: row.pass_type ?? '',
      attachmentId: row.attachment_id ?? '',
      tsca: tscaToForm(row.tsca),
      layerId: row.layer_id ?? '',
    }
  }

  function openInsertNext() {
    const last = activeSorted.at(-1)
    const lastTo = last ? hhmmLocal(last.end_date_time) : '06:00'
    openInsert({
      ...contextFrom(last),
      operatorId: last?.operator_id ?? operators[0]?.id ?? null,
      from: lastTo,
      to: lastTo,
    })
  }

  function openInsertAfter(row) {
    const idx = activeSorted.findIndex((e) => e.id === row.id)
    const next = idx >= 0 ? activeSorted[idx + 1] : null
    const startMs = new Date(row.end_date_time).getTime()
    const nextMs = next ? new Date(next.start_date_time).getTime() : null
    const endMs = nextMs && nextMs > startMs ? (startMs + nextMs) / 2 : startMs + 15 * 60000
    openInsert({
      ...contextFrom(row),
      operatorId: row.operator_id ?? operators[0]?.id ?? null,
      from: hhmmLocal(row.end_date_time),
      to: hhmmLocal(new Date(endMs).toISOString()),
    })
  }

  async function insertGapPlaceholder(gap) {
    if (!project || !selectedEquipmentId) return
    await create({
      project_id: project.id,
      equipment_id: selectedEquipmentId,
      start_date_time: gap.gapStart,
      end_date_time: gap.gapEnd,
      timezone: browserTimeZone(),
      report_date: eventDate,
      category: UNATTRIBUTED_CATEGORY,
      operator_id: gap.prev.operator_id ?? null,
    })
  }

  async function handleInsert() {
    if (!form.from || !form.to || !project || !eventDate) return
    const { start, end } = eventTimestamps(eventDate, form.from, form.to)
    const payload = payloadFromForm(form)
    await create({
      project_id: project.id,
      equipment_id: selectedEquipmentId,
      start_date_time: start,
      end_date_time: end,
      timezone: browserTimeZone(),
      report_date: eventDate,
      category: resolveCategoryForForm(form),
      ...payload,
      // An event created carrying an area is operator-grade, the same rule the
      // non-native stack gets from its INSERT trigger. Pivotly has no triggers,
      // so every writer stamps it.
      area_source: payload.area ? 'operator' : null,
    })
    setInsertOpen(false)
  }

  function openEdit(row) {
    setEditRow(row)
    setFillDown(true)
    setForm({
      from: hhmmLocal(row.start_date_time),
      to: hhmmLocal(row.end_date_time),
      operatorId: row.operator_id ?? null,
      delayCodeId: row.delay_code_id ?? '__operational__',
      areaId: row.area?.area_id ?? '',
      subAreaId: row.area?.sub_area_id ?? '',
      subSubAreaId: row.area?.sub_sub_area_id ?? '',
      passType: row.pass_type ?? '',
      attachmentId: row.attachment_id ?? '',
      tsca: tscaToForm(row.tsca),
      layerId: row.layer_id ?? '',
      notes: row.notes ?? '',
    })
  }

  async function handleSaveEdit() {
    if (!editRow || !eventDate) return
    const { start, end } = eventTimestamps(eventDate, form.from, form.to)
    const payload = payloadFromForm(form)
    // Stamp 'pe' only when the edit actually MOVES the area or pass. Fixing a
    // time window must not quietly demote an operator's area to re-fillable.
    const changedArea =
      JSON.stringify(payload.area ?? null) !== JSON.stringify(editRow.area ?? null)
      || (payload.pass_type ?? null) !== (editRow.pass_type ?? null)
    await update(editRow.id, {
      start_date_time: start,
      end_date_time: end,
      timezone: browserTimeZone(),
      report_date: eventDate,
      category: resolveCategoryForForm(form),
      ...payload,
      ...(changedArea ? { area_source: 'pe' } : {}),
    })
    if (fillDown && payload.area && fillTargets.length) {
      // One record per call -- Pivotly has no bulk update. Failures are
      // collected rather than thrown so one bad row cannot strand the rest.
      const failed = []
      for (const t of fillTargets) {
        try {
          await update(t.id, {
            area: payload.area,
            pass_type: payload.pass_type ?? null,
            area_source: 'pe',
          })
        } catch (err) {
          failed.push(`${hhmm(t.start_date_time)} (${err.message})`)
        }
      }
      setFillError(failed.length
        ? `Filled ${fillTargets.length - failed.length} of ${fillTargets.length}; these did not update: ${failed.join(', ')}.`
        : null)
    } else {
      setFillError(null)
    }
    setEditRow(null)
  }

  async function handleDelete() {
    if (!deleteRow) return
    await remove(deleteRow.id)
    setDeleteRow(null)
  }

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
        <Textarea
          label="Notes"
          placeholder="Optional"
          autosize
          minRows={2}
          value={form.notes}
          onChange={(e) => setField('notes', e.currentTarget.value)}
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
      {fillError && (
        <Box p={10} mb={10} style={{ background: WARNING_BG, borderRadius: 6 }}>
          <Group gap={6} wrap="nowrap" align="flex-start">
            <IconAlertTriangle size={14} color="#92400E" style={{ flexShrink: 0, marginTop: 2 }} />
            <Text size="xs" c="#92400E">{fillError}</Text>
          </Group>
        </Box>
      )}
      {totals && (
        <Box
          p={16}
          mb={10}
          style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6 }}
        >
          <SimpleGrid cols={{ base: 2, md: 5 }} spacing={16}>
            <ShiftStat label="Shift start" value={hhmm(totals.startISO)} />
            <ShiftStat label="Shift end" value={hhmm(totals.endISO)} />
            <ShiftStat label="Operational" value={`${totals.ops.toFixed(2)} h`} />
            <ShiftStat label="Delay" value={`${totals.delay.toFixed(2)} h`} />
            <ShiftStat label="Shift" value={`${totals.shift.toFixed(2)} h`} />
          </SimpleGrid>

          <Box mt={12} pt={12} style={{ borderTop: '1px solid #F3F4F6' }}>
            {totals.balanced ? (
              <Group gap={6} wrap="nowrap">
                <IconCheck size={14} color="#047857" />
                <Text size="xs" c="#047857">Operational + Delay = Shift</Text>
              </Group>
            ) : (
              <Group gap={6} wrap="nowrap">
                <IconFlag size={14} color="#B91C1C" />
                <Text size="xs" c="#B91C1C">
                  Shift duration {totals.imbalanceMinutes > 0 ? 'exceeds' : 'is less than'} Operational + Delay by{' '}
                  {Math.abs(totals.imbalanceMinutes)} min — review the log.
                </Text>
              </Group>
            )}
            {unattributedCount > 0 && (
              <Badge size="xs" color="orange" mt={8}>
                {unattributedCount} placeholder{unattributedCount === 1 ? '' : 's'} need review before submitting
              </Badge>
            )}
          </Box>
        </Box>
      )}

      <Group justify="space-between" mb={8}>
        <Group gap={12}>
          <Text size="xs" c="dimmed">
            {activeSorted.length} events{equipmentName ? ` · ${equipmentName}` : ''}
          </Text>
          {canViewDeletedEvents && (
            <Switch
              size="xs"
              label="Show deleted"
              checked={showDeleted}
              onChange={(ev) => setShowDeleted(ev.currentTarget.checked)}
            />
          )}
        </Group>
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
            <Table.Th style={{ width: 84 }} />
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
            return [
            <Table.Tr
              key={e.id}
              style={{
                ...(e.is_deleted ? { opacity: 0.5 } : null),
                ...(isUnattributed(e) ? { background: '#fdf6e3' } : null),
              }}
            >
              <Table.Td>{i + 1}</Table.Td>
              <Table.Td>{hhmm(e.start_date_time)}</Table.Td>
              <Table.Td>{hhmm(e.end_date_time)}</Table.Td>
              <Table.Td>{fmtDuration(e.start_date_time, e.end_date_time)}</Table.Td>
              <Table.Td>
                {isUnattributed(e) ? (
                  <Badge size="xs" color="orange" variant="light">Needs review</Badge>
                ) : (
                  e.category || delayCode?.code || '—'
                )}
              </Table.Td>
              <Table.Td>{resolveArea(e.area, areaNameById)}</Table.Td>
              <Table.Td>{e.pass_type ? (passTypeLabels[e.pass_type] ?? e.pass_type) : '—'}</Table.Td>
              <Table.Td>{tscaLabel(e.tsca)}</Table.Td>
              <Table.Td>{operators.find((o) => o.id === e.operator_id)?.name ?? '—'}</Table.Td>
              <Table.Td>{e.notes || '—'}</Table.Td>
              <Table.Td c="dimmed">{SAMPLE}</Table.Td>
              <Table.Td>
                {e.is_deleted ? (
                  <Badge size="xs" color="gray">Deleted</Badge>
                ) : (
                  <Group gap={6} wrap="nowrap">
                    <Box onClick={() => openEdit(e)} style={{ cursor: 'pointer', color: '#888', display: 'flex' }} title="Edit">
                      <IconPencil size={13} />
                    </Box>
                    <Box onClick={() => setDeleteRow(e)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }} title="Delete">
                      <IconTrash size={13} />
                    </Box>
                  </Group>
                )}
              </Table.Td>
            </Table.Tr>,
            gapAfterId.has(e.id) && !e.is_deleted && (
              <Table.Tr key={`gap-${e.id}`} style={{ background: WARNING_BG }}>
                <Table.Td colSpan={12}>
                  <Group justify="space-between" wrap="wrap" gap={8}>
                    <Group gap={8}>
                      <IconAlertTriangle size={13} color="#b5740a" />
                      <Text size="xs" c="#7a5206">
                        <strong>Unaccounted hours</strong>{' '}
                        {hhmm(gapAfterId.get(e.id).gapStart)}–{hhmm(gapAfterId.get(e.id).gapEnd)} ·{' '}
                        {fmtDurationMs(gapAfterId.get(e.id).durationMs)}
                      </Text>
                    </Group>
                    <Button
                      size="compact-xs"
                      color="orange"
                      leftSection={<IconPlus size={11} />}
                      onClick={() => insertGapPlaceholder(gapAfterId.get(e.id))}
                    >
                      Insert event
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ),
            <Table.Tr
              key={`strip-${e.id}`}
              onMouseEnter={() => setHoverStrip(e.id)}
              onMouseLeave={() => setHoverStrip((cur) => (cur === e.id ? null : cur))}
            >
              <Table.Td colSpan={12} p={0} style={{ height: 18, borderTop: 'none' }}>
                <Button
                  variant="subtle"
                  size="compact-xs"
                  fullWidth
                  leftSection={<IconPlus size={11} />}
                  onClick={() => openInsertAfter(e)}
                  style={{ opacity: hoverStrip === e.id ? 1 : 0, height: 18, transition: 'opacity 120ms' }}
                >
                  Insert event
                </Button>
              </Table.Td>
            </Table.Tr>,
            ]
          })}
        </Table.Tbody>
      </Table>

      <Modal key={insertKey} opened={insertOpen} onClose={() => setInsertOpen(false)} title={<Text fw={700} size="sm">Insert Event</Text>} size="sm">
        {FormFields()}
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setInsertOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleInsert} disabled={!form.from || !form.to} style={{ background: '#0F2744', border: 'none' }}>Insert</Button>
        </Group>
      </Modal>

      <Modal opened={!!editRow} onClose={() => setEditRow(null)} title={<Text fw={700} size="sm">Edit Event</Text>} size="sm">
        {FormFields()}
        {fillTargets.length > 0 && (
          <Checkbox
            mt={10}
            size="xs"
            checked={fillDown}
            onChange={(e) => setFillDown(e.currentTarget.checked)}
            label={`Apply this Area & Pass to the ${fillTargets.length} event${fillTargets.length > 1 ? 's' : ''} below`}
            description="Stops at the first event whose Area came from the operator — those are never overwritten."
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setEditRow(null)}>Cancel</Button>
          <Button size="xs" onClick={handleSaveEdit} style={{ background: '#0F2744', border: 'none' }}>Save</Button>
        </Group>
      </Modal>

      <Modal opened={!!deleteRow} onClose={() => setDeleteRow(null)} title={<Text fw={700} size="sm">Delete Event</Text>} size="sm">
        <Text size="sm" mb={16}>
          {deleteRow
            ? `Delete the ${hhmm(deleteRow.start_date_time)}–${hhmm(deleteRow.end_date_time)} event? It will be removed from the log and the report, but stays recoverable — anyone with permission can see it again with "Show deleted".`
            : ''}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setDeleteRow(null)}>Cancel</Button>
          <Button size="xs" color="red" onClick={handleDelete}>Delete</Button>
        </Group>
      </Modal>
    </Box>
  )
}
