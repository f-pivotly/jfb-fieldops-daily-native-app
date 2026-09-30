import { useState } from 'react'
import { Box, Text, Table, Group, Button, Checkbox, Modal, TextInput, Textarea, Select, Switch, Badge, SimpleGrid, Radio } from '@mantine/core'
import { IconPlus, IconAlertTriangle, IconCheck, IconFlag } from '@tabler/icons-react'
import { useEvents } from '../../../hooks/production/useEvents'
import { useFieldOpsAction } from '../../../contexts/fieldOpsAccessContext'
import { useOperators } from '../../../hooks/production/useOperators'
import { useProjectAreas } from '../../../hooks/project/useProjectAreas'
import { usePassTypes } from '../../../hooks/core/usePassTypes'
import { useDelayCodes } from '../../../hooks/production/useDelayCodes'
import { useProjectDelayCodes } from '../../../hooks/production/useProjectDelayCodes'
import { useProjectAttachments } from '../../../hooks/project/useProjectAttachments'
import { useProjectLayers } from '../../../hooks/capping/useProjectLayers'
import { useWorkTypes } from '../../../hooks/project/useWorkTypes'
import { equipmentWorkType, activeCategoryLabel } from '../lib/workType'
import { UNATTRIBUTED_CATEGORY, findEventGaps, shiftTotals, fmtDurationMs, isUnattributed } from '../lib/eventTotals'
import { hhmm24 as hhmm } from '../../../lib/reportDates'
import { browserTimeZone } from '../../../lib/reportTz'
import { computeAreaFillTargets, compareActivitiesChrono, hasArea as hasOwnArea } from '../../../lib/eventAreaFill'
import { isTransition, withTransitionState } from '../../../lib/transitionState'
import { TRANSITION_CATEGORY } from '../../../lib/operationalCategory'
import { useAreaLevels } from '../../../hooks/project/useAreaLevels'
import { WARNING_BG } from './components/WarningBanner'
import ReasonDialog from '../../../components/ReasonDialog'
import { FETCH_PAGE_SIZE } from '../../../constants/pagination'

const PAGE_SIZE = FETCH_PAGE_SIZE


function resolveDelayCode(delayCodeId, projectDelayCodeById, masterDelayCodeById) {
  if (!delayCodeId) return null
  const row = projectDelayCodeById.get(delayCodeId)
  if (!row) return null
  const master = row.delay_code_id ? masterDelayCodeById.get(row.delay_code_id) : null
  return {
    category: master ? master.category : row.category,
    code: master ? master.code : row.code,
    codeNum: master ? master.code_num : row.code_num,
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
  mode: 'event',
  time: '',
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

const HELP_BELOW = ['label', 'input', 'description', 'error']
const EVENT_TYPE_HELP = 'Operational/Delay = real From→To window with a category like “Service Water” or “Startup”. Transition = zero-duration marker for an area / pass / attachment change.'
const OPERATOR_HELP = 'Who actually ran the dredge for this event. Office-staff inserts should pick the field operator (not yourself) so cross-project hour rollups stay accurate.'
const ATTACHMENT_HELP = 'Dredge attachment for the combo. Appears as “{attachment} | {pass}” on the production sheet column header. Restricted to project-configured values so typos can’t split the combo into two columns.'
const LAYER_HELP = 'Which lift was being placed. Ties this event’s time — and any bucket placements logged during it — to the right layer.'
const MODAL_WIDTH = 512

function buildCategoryOptions({ projectDelayCodes, projectDelayCodeById, masterDelayCodeById, workTypeId, operationalLabel }) {
  const groups = new Map()
  for (const r of projectDelayCodes) {
    if (r.active === false) continue
    const master = r.delay_code_id ? masterDelayCodeById.get(r.delay_code_id) : null
    const wtId = (master ? master.work_type_id : r.work_type_id) ?? null
    if (wtId != null && wtId !== workTypeId) continue
    const resolved = resolveDelayCode(r.id, projectDelayCodeById, masterDelayCodeById)
    const group = resolved?.category || 'Delay'
    const code = resolved?.code ?? '(unnamed)'
    const label = resolved?.codeNum == null ? code : `${code} (#${resolved.codeNum})`
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push({ value: r.id, label })
  }
  return [
    { group: 'Operational', items: [{ value: '__operational__', label: operationalLabel }] },
    ...[...groups].map(([group, items]) => ({ group, items })),
  ]
}

function activeOrSelected(list, selectedId) {
  return list.filter((a) => a.is_active !== false || a.id === selectedId)
}

function payloadForMode(f) {
  const payload = payloadFromForm(f)
  return f.mode === 'transition' ? { ...payload, delay_code_id: null } : payload
}

function canSaveForm(f) {
  if (f.mode === 'transition') return !!f.time && !!f.areaId
  return !!f.from && !!f.to
}

function categoryCellFor(e, delayCode) {
  if (isUnattributed(e)) return <Badge size="xs" color="orange" variant="light">Needs review</Badge>
  if (isTransition(e)) return <Badge size="xs" color="blue" variant="light">Transition</Badge>
  return e.category || delayCode?.code || '—'
}

function rowDisplay(e, effectiveById, dayEvents, delayCode) {
  const eff = effectiveById.get(e.id) ?? e
  const inheritedFrom = eff.inheritedFromTransitionId && !hasOwnArea(e)
    ? dayEvents.find((t) => t.id === eff.inheritedFromTransitionId)
    : null
  return {
    transitionRow: isTransition(e),
    eff,
    inheritedStyle: inheritedFrom ? { color: 'var(--mantine-color-dimmed)', fontStyle: 'italic' } : undefined,
    inheritedTitle: inheritedFrom ? `From the transition at ${hhmm(inheritedFrom.start_date_time)}` : undefined,
    categoryCell: categoryCellFor(e, delayCode),
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

function EventFormFields({
  form, isEdit, setField, setAreaLevel, areaLevelLabels, areas, operators, delayCodeOptions,
  passOptions, attachments, layers, multiLayer, showTsca,
}) {
  const areaLabel = (level, fallback) => areaLevelLabels[level - 1] || fallback
  const l1Areas = areas.filter((a) => !a.parent_id)
  const childrenOf = (parentId) => areas.filter((a) => a.parent_id === parentId)
  const l1Options = activeOrSelected(l1Areas, form.areaId)
  const l2Options = form.areaId ? activeOrSelected(childrenOf(form.areaId), form.subAreaId) : []
  const l3Options = form.subAreaId ? activeOrSelected(childrenOf(form.subAreaId), form.subSubAreaId) : []
  const showL2 = !!areaLevelLabels[1] || l2Options.length > 0
  const showL3 = !!areaLevelLabels[2] || l3Options.length > 0
  const isTransitionForm = form.mode === 'transition'
  return (
    <>
      {!isEdit && (
        <Radio.Group
          label="Event type"
          description={EVENT_TYPE_HELP}
          inputWrapperOrder={HELP_BELOW}
          value={form.mode}
          onChange={(v) => setField('mode', v)}
          mb={12}
        >
          <Group gap={16} mt={6} mb={4}>
            <Radio value="event" label="Operational / Delay" size="xs" />
            <Radio value="transition" label="Transition (state marker)" size="xs" />
          </Group>
        </Radio.Group>
      )}
      {isTransitionForm ? (
        <TextInput label="Time" type="time" value={form.time} onChange={(e) => setField('time', e.currentTarget.value)} mb={12} />
      ) : (
        <Group grow mb={12}>
          <TextInput label="From time" type="time" value={form.from} onChange={(e) => setField('from', e.currentTarget.value)} />
          <TextInput label="To time" type="time" value={form.to} onChange={(e) => setField('to', e.currentTarget.value)} />
        </Group>
      )}
      {!isTransitionForm && (
        <Select
          label="Category"
          placeholder="— Select category —"
          data={delayCodeOptions}
          value={form.delayCodeId || null}
          onChange={(v) => setField('delayCodeId', v ?? '')}
          mb={12}
        />
      )}
      <Select
        label="Operator"
        placeholder="— Select operator —"
        description={OPERATOR_HELP}
        inputWrapperOrder={HELP_BELOW}
        data={operators.map((o) => ({ value: o.id, label: o.name }))}
        value={form.operatorId}
        onChange={(v) => setField('operatorId', v)}
        mb={12}
      />
      <Select
        label={areaLabel(1, 'Area')}
        placeholder="— Select —"
        data={l1Options.map((a) => ({ value: a.id, label: a.name }))}
        value={form.areaId || null}
        onChange={(v) => setAreaLevel(1, v ?? '')}
        clearable
        withAsterisk={isTransitionForm}
        mb={12}
      />
      {showL2 && (
        <Select
          label={areaLabel(2, 'Sub-Area')}
          placeholder="— Select —"
          data={l2Options.map((a) => ({ value: a.id, label: a.name }))}
          value={form.subAreaId || null}
          onChange={(v) => setAreaLevel(2, v ?? '')}
          disabled={l2Options.length === 0}
          clearable
          mb={12}
        />
      )}
      {showL3 && (
        <Select
          label={areaLabel(3, 'Sub-Sub-Area')}
          placeholder="— Select —"
          data={l3Options.map((a) => ({ value: a.id, label: a.name }))}
          value={form.subSubAreaId || null}
          onChange={(v) => setAreaLevel(3, v ?? '')}
          disabled={l3Options.length === 0}
          clearable
          mb={12}
        />
      )}
      {!multiLayer && (
        <Select
          label="Pass"
          placeholder="— Select —"
          data={passOptions}
          value={form.passType || null}
          onChange={(v) => setField('passType', v ?? '')}
          clearable
          mb={12}
        />
      )}
      {attachments.length > 0 ? (
        <Select
          label="Attachment"
          placeholder="— None —"
          description={ATTACHMENT_HELP}
          inputWrapperOrder={HELP_BELOW}
          data={attachments.map((a) => ({ value: a.id, label: a.name }))}
          value={form.attachmentId || null}
          onChange={(v) => setField('attachmentId', v ?? '')}
          clearable
          mb={12}
        />
      ) : (
        <Box mb={12}>
          <Text size="sm" fw={500} mb={4}>Attachment</Text>
          <Text size="xs" c="#b45309" p={8} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4 }}>
            No attachments configured for this project. <strong>Add one in Settings → Attachments</strong> before inserting events.
          </Text>
        </Box>
      )}
      {showTsca && (
        <Radio.Group label="TSCA" value={form.tsca} onChange={(v) => setField('tsca', v)} mb={12}>
          <Group gap={16} mt={6}>
            <Radio value="yes" label="Yes" size="xs" />
            <Radio value="no" label="No" size="xs" />
          </Group>
        </Radio.Group>
      )}
      {multiLayer && (
        <Select
          label="Layer"
          placeholder="— Select layer —"
          description={LAYER_HELP}
          inputWrapperOrder={HELP_BELOW}
          data={layers.map((l) => ({ value: l.id, label: l.layer_name ?? l.name }))}
          value={form.layerId || null}
          onChange={(v) => setField('layerId', v ?? '')}
          clearable
          mb={12}
        />
      )}
      <Textarea
        label={isEdit ? 'Notes' : 'Note (optional)'}
        minRows={2}
        autosize
        value={form.notes}
        onChange={(e) => setField('notes', e.currentTarget.value)}
        mb={12}
      />
    </>
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
  const { delayCodes: masterDelayCodes } = useDelayCodes()
  const { projectDelayCodes } = useProjectDelayCodes(project?.id)
  const { attachments } = useProjectAttachments(project?.id)
  const { layers } = useProjectLayers(project?.id)
  const { workTypes } = useWorkTypes()
  const { areaLevels } = useAreaLevels(project?.id)
  const areaLevelLabels = [...areaLevels]
    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
    .map((l) => l.label?.trim())

  const areaNameById = new Map(areas.map((a) => [a.id, a.name]))
  const masterDelayCodeById = new Map(masterDelayCodes.map((m) => [m.id, m]))
  const projectDelayCodeById = new Map(projectDelayCodes.map((r) => [r.id, r]))

  const selectedEquipment = equipment.find((e) => e.id === selectedEquipmentId) ?? null
  const workType = equipmentWorkType(project, selectedEquipment, eventDate)
  const { labels: passTypeLabels, values: passTypeValues } = usePassTypes(workType)
  const workTypeId = workTypes.find((w) => w.name === workType)?.id ?? null

  function resolveCategoryForForm(f) {
    if (f.delayCodeId && f.delayCodeId !== '__operational__') {
      return resolveDelayCode(f.delayCodeId, projectDelayCodeById, masterDelayCodeById)?.code ?? null
    }
    return activeCategoryLabel(project, selectedEquipment, eventDate)
  }

  const delayCodeOptions = buildCategoryOptions({
    projectDelayCodes,
    projectDelayCodeById,
    masterDelayCodeById,
    workTypeId,
    operationalLabel: activeCategoryLabel(project, selectedEquipment, eventDate),
  })

  const multiLayer = layers.length > 1

  const equipmentEvents = events.filter((e) => e.equipment_id === selectedEquipmentId)
  const effectiveById = new Map(withTransitionState(equipmentEvents).map((e) => [e.id, e]))
  const activeSorted = equipmentEvents
    .filter((e) => !e.is_deleted)
    .sort(compareActivitiesChrono)
  const sorted = (showDeleted && canViewDeletedEvents ? equipmentEvents : activeSorted)
    .slice()
    .sort(compareActivitiesChrono)
  const transitionCount = activeSorted.filter(isTransition).length
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
  const fillTargets = editRow && !isTransition(editRow) ? computeAreaFillTargets(activeSorted, editRow.id) : []
  const [deleteRow, setDeleteRow] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [hoverStrip, setHoverStrip] = useState(null)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [form, setForm] = useState(EMPTY_FORM)

  const visibleRows = sorted.slice(0, shown)
  const remaining = Math.max(0, sorted.length - visibleRows.length)

  const listKey = `${selectedEquipmentId ?? ''}|${eventDate ?? ''}|${showDeleted}`
  const [prevListKey, setPrevListKey] = useState(listKey)
  if (listKey !== prevListKey) {
    setPrevListKey(listKey)
    setShown(PAGE_SIZE)
  }

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

  function contextFrom(rawRow) {
    if (!rawRow) return {}
    const row = effectiveById.get(rawRow.id) ?? rawRow
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
      time: lastTo,
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
      time: hhmmLocal(row.end_date_time),
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

  function timesFromForm(f) {
    if (f.mode === 'transition') {
      const { start } = eventTimestamps(eventDate, f.time, f.time)
      return { start, end: start }
    }
    return eventTimestamps(eventDate, f.from, f.to)
  }

  function categoryFromForm(f) {
    return f.mode === 'transition' ? TRANSITION_CATEGORY : resolveCategoryForForm(f)
  }

  async function handleInsert() {
    if (!canSaveForm(form) || !project || !eventDate) return
    const { start, end } = timesFromForm(form)
    const payload = payloadForMode(form)
    await create({
      project_id: project.id,
      equipment_id: selectedEquipmentId,
      start_date_time: start,
      end_date_time: end,
      timezone: browserTimeZone(),
      report_date: eventDate,
      category: categoryFromForm(form),
      ...payload,
      area_source: payload.area ? 'operator' : null,
    })
    setInsertOpen(false)
  }

  function openEdit(row) {
    setEditRow(row)
    setFillDown(true)
    setForm({
      mode: isTransition(row) ? 'transition' : 'event',
      time: hhmmLocal(row.start_date_time),
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
    if (!editRow || !eventDate || !canSaveForm(form)) return
    const { start, end } = timesFromForm(form)
    const payload = payloadForMode(form)
    const changedArea =
      JSON.stringify(payload.area ?? null) !== JSON.stringify(editRow.area ?? null)
      || (payload.pass_type ?? null) !== (editRow.pass_type ?? null)
    await update(editRow.id, {
      start_date_time: start,
      end_date_time: end,
      timezone: browserTimeZone(),
      report_date: eventDate,
      category: categoryFromForm(form),
      ...payload,
      ...(changedArea ? { area_source: 'pe' } : {}),
    })
    if (fillDown && payload.area && fillTargets.length) {
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

  async function handleDelete(reason) {
    if (!deleteRow) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await update(deleteRow.id, { deletion_reason: reason })
      await remove(deleteRow.id)
      setDeleteRow(null)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
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
            {activeSorted.length - transitionCount} events
            {transitionCount > 0 ? ` · ${transitionCount} transition${transitionCount === 1 ? '' : 's'}` : ''}
            {equipmentName ? ` · ${equipmentName}` : ''}
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

      <Table withTableBorder verticalSpacing="xs" fz="xs">
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
            <Table.Th style={{ width: 140 }} />
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
          {visibleRows.map((e, i) => {
            const delayCode = resolveDelayCode(e.delay_code_id, projectDelayCodeById, masterDelayCodeById)
            const { transitionRow, eff, inheritedStyle, inheritedTitle, categoryCell } =
              rowDisplay(e, effectiveById, equipmentEvents, delayCode)
            return [
            <Table.Tr
              key={e.id}
              style={{
                ...(e.is_deleted ? { opacity: 0.5 } : null),
                ...(isUnattributed(e) ? { background: '#fdf6e3' } : null),
                ...(transitionRow ? { background: '#EFF6FF' } : null),
              }}
            >
              <Table.Td>{i + 1}</Table.Td>
              <Table.Td>{hhmm(e.start_date_time)}</Table.Td>
              <Table.Td>{hhmm(e.end_date_time)}</Table.Td>
              <Table.Td>{fmtDuration(e.start_date_time, e.end_date_time)}</Table.Td>
              <Table.Td>{categoryCell}</Table.Td>
              <Table.Td style={inheritedStyle} title={inheritedTitle}>{resolveArea(eff.area, areaNameById)}</Table.Td>
              <Table.Td style={inheritedStyle} title={inheritedTitle}>{eff.pass_type ? (passTypeLabels[eff.pass_type] ?? eff.pass_type) : '—'}</Table.Td>
              <Table.Td style={inheritedStyle} title={inheritedTitle}>{tscaLabel(eff.tsca)}</Table.Td>
              <Table.Td>{operators.find((o) => o.id === e.operator_id)?.name ?? '—'}</Table.Td>
              <Table.Td>{e.notes || '—'}</Table.Td>
              
              <Table.Td>
                {e.is_deleted ? (
                  <Box>
                    <Badge size="xs" color="gray">Deleted</Badge>
                    {e.deletion_reason && (
                      <Text size="10px" c="dimmed" fs="italic" mt={2}>{e.deletion_reason}</Text>
                    )}
                    {e.deleted_at && (
                      <Text size="10px" c="dimmed">{new Date(e.deleted_at).toLocaleString()}</Text>
                    )}
                  </Box>
                ) : (
                  <Group gap={10} wrap="nowrap">
                    <Button size="xs" variant="subtle" onClick={() => openEdit(e)}>Edit</Button>
                    <Button size="xs" variant="subtle" color="red" onClick={() => { setDeleteError(null); setDeleteRow(e) }}>Delete</Button>
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

      {sorted.length > 0 && (
        <Group justify="center" mt={10} gap={12} wrap="wrap">
          <Text size="xs" c="dimmed">
            Showing {visibleRows.length} of {sorted.length}
          </Text>
          {remaining > 0 && (
            <Button
              size="xs"
              variant="default"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
            >
              Load {Math.min(PAGE_SIZE, remaining)} more
            </Button>
          )}
          {remaining > PAGE_SIZE && (
            <Button size="xs" variant="subtle" onClick={() => setShown(sorted.length)}>
              Show all {sorted.length}
            </Button>
          )}
        </Group>
      )}

      <Modal key={insertKey} opened={insertOpen} onClose={() => setInsertOpen(false)} title={<Text fw={700} size="sm">Insert event</Text>} size={MODAL_WIDTH}>
        <EventFormFields
          form={form}
          isEdit={false}
          setField={setField}
          setAreaLevel={setAreaLevel}
          areaLevelLabels={areaLevelLabels}
          areas={areas}
          operators={operators}
          delayCodeOptions={delayCodeOptions}
          passOptions={passTypeValues.map((v) => ({ value: v, label: passTypeLabels[v] ?? v }))}
          attachments={attachments}
          layers={layers}
          multiLayer={multiLayer}
          showTsca={!!project?.is_tsca_zone_tracking}
        />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setInsertOpen(false)}>Cancel</Button>
          <Button size="xs" onClick={handleInsert} disabled={!canSaveForm(form)} style={{ background: '#0F2744', border: 'none' }}>Insert event</Button>
        </Group>
      </Modal>

      <Modal opened={!!editRow} onClose={() => setEditRow(null)} title={<Text fw={700} size="sm">{editRow && isTransition(editRow) ? 'Edit transition' : 'Edit event'}</Text>} size={MODAL_WIDTH}>
        <EventFormFields
          form={form}
          isEdit={true}
          setField={setField}
          setAreaLevel={setAreaLevel}
          areaLevelLabels={areaLevelLabels}
          areas={areas}
          operators={operators}
          delayCodeOptions={delayCodeOptions}
          passOptions={passTypeValues.map((v) => ({ value: v, label: passTypeLabels[v] ?? v }))}
          attachments={attachments}
          layers={layers}
          multiLayer={multiLayer}
          showTsca={!!project?.is_tsca_zone_tracking}
        />
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
          <Button size="xs" onClick={handleSaveEdit} disabled={!canSaveForm(form)} style={{ background: '#0F2744', border: 'none' }}>Save changes</Button>
        </Group>
      </Modal>

      <ReasonDialog
        opened={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        title="Delete Event"
        description={
          <>
            {deleteRow
              ? `Delete the ${hhmm(deleteRow.start_date_time)}–${hhmm(deleteRow.end_date_time)} event? It will be removed from the log and the report, but stays recoverable — anyone with permission can see it again with "Show deleted".`
              : ''}
            {deleteError && (
              <Text component="span" display="block" size="xs" c="red" mt={8}>{deleteError}</Text>
            )}
          </>
        }
        label="Reason for deletion (required)"
        placeholder="e.g. duplicate of next row, wrong equipment, operator entry error"
        confirmLabel="Delete"
        confirmColor="red"
        onConfirm={handleDelete}
        submitting={deleting}
      />
    </Box>
  )
}
