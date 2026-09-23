import { useState } from 'react'
import {
  Box, Text, Group, Button, Modal, TextInput, NumberInput, Select, MultiSelect,
  Textarea, Switch, Table, Badge,
} from '@mantine/core'
import { IconPencil, IconTrash, IconPlus } from '@tabler/icons-react'
import { useRealizedScopes } from '../../../hooks/project/useRealizedScopes'
import { useProjectAreas } from '../../../hooks/project/useProjectAreas'
import { usePicklist } from '../../../hooks/core/usePicklist'
import { useConfirmDialog } from '../../../hooks/ui/useConfirmDialog'
import { useAsyncAction } from '../../../hooks/ui/useAsyncAction'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'
import { prettyDate } from '../lib/realizedToDate'

const emptyDraft = () => ({
  label: '',
  sort_order: 10,
  start_date: '',
  end_date: '',
  baseline_cy: '',
  goal: '',
  cy_goh_goal: '',
  expected_goh_per_day: '',
  production_days_per_week: '',
  areaMode: 'all',
  areaIds: [],
  chart_region: '',
  notes: '',
  active: true,
})

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const ids = (v) => (Array.isArray(v) ? v.filter(Boolean) : [])

function draftFromRow(row) {
  const include = ids(row.include_area_ids)
  const exclude = ids(row.exclude_area_ids)
  let areaMode = 'all'
  if (include.length) areaMode = 'include'
  else if (exclude.length) areaMode = 'exclude'
  return {
    label: row.label ?? '',
    sort_order: row.sort_order ?? 10,
    start_date: row.start_date ? String(row.start_date).slice(0, 10) : '',
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : '',
    baseline_cy: row.baseline_cy ?? '',
    goal: row.goal ?? '',
    cy_goh_goal: row.cy_goh_goal ?? '',
    expected_goh_per_day: row.expected_goh_per_day ?? '',
    production_days_per_week: row.production_days_per_week ?? '',
    areaMode,
    areaIds: areaMode === 'include' ? include : exclude,
    chart_region: row.chart_region ?? '',
    notes: row.notes ?? '',
    active: row.active !== false,
  }
}

function payloadFromDraft(d, projectId) {
  return {
    project_id: projectId,
    label: d.label.trim(),
    sort_order: num(d.sort_order) ?? 10,
    start_date: d.start_date || null,
    end_date: d.end_date || null,
    baseline_cy: num(d.baseline_cy),
    goal: num(d.goal),
    cy_goh_goal: num(d.cy_goh_goal),
    expected_goh_per_day: num(d.expected_goh_per_day),
    production_days_per_week: num(d.production_days_per_week),
    include_area_ids: d.areaMode === 'include' ? d.areaIds : [],
    exclude_area_ids: d.areaMode === 'exclude' ? d.areaIds : [],
    chart_region: d.chart_region || null,
    notes: d.notes?.trim() ? d.notes.trim() : null,
    active: d.active !== false,
  }
}

export default function RealizedScopesTab({ project }) {
  const hasProject = !!project?.id
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { scopes, loading, error, create, update, remove } = useRealizedScopes(project?.id)
  const { areas } = useProjectAreas(project?.id)
  const { values: regionValues, labels: regionLabels } = usePicklist('pkl-jfb-scope-chart-region')
  const { busy, error: saveError, run } = useAsyncAction()

  const [addOpen, setAddOpen] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [draft, setDraft] = useState(emptyDraft())

  const areaOptions = (areas ?? [])
    .filter((a) => a.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((a) => ({ value: a.id, label: a.name }))
  const areaNameById = new Map(areaOptions.map((o) => [o.value, o.label]))
  const regionOptions = regionValues.map((v) => ({ value: v, label: regionLabels[v] ?? v }))

  const sorted = [...(scopes ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label).localeCompare(String(b.label)),
  )

  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }))
  const setText = (k) => (e) => {
    const v = e.currentTarget.value
    setDraft((d) => ({ ...d, [k]: v }))
  }

  function openAdd() {
    setDraft({ ...emptyDraft(), sort_order: (sorted[sorted.length - 1]?.sort_order ?? 0) + 10 })
    setAddOpen(true)
  }

  function openEdit(row) {
    setDraft(draftFromRow(row))
    setEditRow(row)
  }

  async function save() {
    if (!draft.label.trim()) return
    await run(async () => {
      const payload = payloadFromDraft(draft, project.id)
      if (editRow) await update(editRow.id, payload)
      else await create(payload)
      setAddOpen(false)
      setEditRow(null)
      return 'Saved.'
    })
  }

  async function handleDelete(row) {
    const ok = await confirm(
      `Delete the "${row.label}" scope? Reports already issued keep their figures, but this scope disappears from the Realized To-Date selector.`,
    )
    if (!ok) return
    await run(async () => {
      await remove(row.id)
      return 'Deleted.'
    })
  }

  function areaSummary(row) {
    const include = ids(row.include_area_ids)
    const exclude = ids(row.exclude_area_ids)
    if (include.length) return `Only ${include.map((i) => areaNameById.get(i) ?? '?').join(', ')}`
    if (exclude.length) return `All except ${exclude.map((i) => areaNameById.get(i) ?? '?').join(', ')}`
    return 'All areas'
  }

  if (!hasProject) return null
  if (loading) return <LoadingSpinner />

  const form = (
    <>
      <SafeError message={saveError} mb={8} />
      <TextInput label="Label" required placeholder='e.g. "Part 1" or "Mechanical Dredging (complete)"'
        value={draft.label} onChange={setText('label')} mb={10} />
      <Group grow mb={10}>
        <TextInput label="Start date" type="date" value={draft.start_date} onChange={setText('start_date')} />
        <TextInput
          label="End date"
          type="date"
          value={draft.end_date}
          onChange={setText('end_date')}
          description="Leave blank while the work is still going. Set it once the phase is finished."
        />
      </Group>
      <Group grow mb={10}>
        <NumberInput label="Goal" value={draft.goal} onChange={set('goal')} min={0} thousandSeparator />
        <NumberInput label="Opening balance" value={draft.baseline_cy} onChange={set('baseline_cy')} min={0} thousandSeparator
          description="Produced before the start date." />
      </Group>
      <Group grow mb={10}>
        <NumberInput label="Bid rate (per GOH)" value={draft.cy_goh_goal} onChange={set('cy_goh_goal')} min={0} />
        <NumberInput label="Expected GOH / day" value={draft.expected_goh_per_day} onChange={set('expected_goh_per_day')} min={0} />
        <NumberInput label="Production days / week" value={draft.production_days_per_week} onChange={set('production_days_per_week')} min={0} max={7} />
      </Group>
      <Select
        label="Areas counted"
        data={[
          { value: 'all', label: 'All areas' },
          { value: 'include', label: 'Only the areas I pick' },
          { value: 'exclude', label: 'Everything except the areas I pick' },
        ]}
        value={draft.areaMode}
        onChange={(v) => setDraft((d) => ({ ...d, areaMode: v ?? 'all', areaIds: v === 'all' ? [] : d.areaIds }))}
        allowDeselect={false}
        mb={10}
      />
      {draft.areaMode !== 'all' && (
        <MultiSelect
          label="Areas"
          data={areaOptions}
          value={draft.areaIds}
          onChange={set('areaIds')}
          searchable
          clearable
          mb={10}
        />
      )}
      {regionOptions.length > 0 && (
        <Select label="Chart region" data={regionOptions} value={draft.chart_region || null}
          onChange={(v) => setDraft((d) => ({ ...d, chart_region: v ?? '' }))} clearable mb={10}
          description="Only for projects whose contracts split by sampling cells." />
      )}
      <Textarea label="Notes" value={draft.notes} onChange={setText('notes')} autosize minRows={2} mb={10}
        description="Why this scope is drawn the way it is — worth writing down so the dates don't look arbitrary later." />
      <Group justify="space-between" mb={4}>
        <Switch label="Active" checked={draft.active} onChange={(e) => set('active')(e.currentTarget.checked)} />
        <NumberInput label="Sort order" w={120} value={draft.sort_order} onChange={set('sort_order')} min={0} />
      </Group>
    </>
  )

  return (
    <>
      {confirmModal}
      <SafeError message={error} mb={10} />

      <Group justify="space-between" mb={12}>
        <Box>
          <Text fw={600} size="sm">Realized To-Date scopes</Text>
          <Text size="xs" c="dimmed" mt={2}>
            A scope is one contract or phase measured on its own. With none set up, Realized To-Date
            covers the whole project using the goal and rate from Project Settings.
          </Text>
        </Box>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openAdd}
          style={{ background: '#0F2744', border: 'none' }}>
          Add scope
        </Button>
      </Group>

      {sorted.length === 0 ? (
        <Box p={30} ta="center" style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8 }}>
          <Text size="sm" fw={500}>No scopes for this project.</Text>
          <Text size="xs" c="dimmed" mt={4}>
            Realized To-Date is reporting the whole project against its own goal. Add a scope when a
            project runs more than one contract, or when a finished phase should stop counting later work.
          </Text>
        </Box>
      ) : (
        <Table withTableBorder verticalSpacing="xs" fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Label</Table.Th>
              <Table.Th>From</Table.Th>
              <Table.Th>To</Table.Th>
              <Table.Th ta="right">Goal</Table.Th>
              <Table.Th ta="right">Bid rate</Table.Th>
              <Table.Th>Areas</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th style={{ width: 84 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td fw={500}>{r.label}</Table.Td>
                <Table.Td>{r.start_date ? prettyDate(String(r.start_date).slice(0, 10)) : '—'}</Table.Td>
                <Table.Td>
                  {r.end_date
                    ? prettyDate(String(r.end_date).slice(0, 10))
                    : <Badge size="xs" color="green" variant="light">Ongoing</Badge>}
                </Table.Td>
                <Table.Td ta="right">{r.goal ? Number(r.goal).toLocaleString() : '—'}</Table.Td>
                <Table.Td ta="right">{r.cy_goh_goal ?? '—'}</Table.Td>
                <Table.Td>{areaSummary(r)}</Table.Td>
                <Table.Td>
                  {r.active === false
                    ? <Badge size="xs" color="gray" variant="light">Retired</Badge>
                    : <Badge size="xs" color="teal" variant="light">Active</Badge>}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Button size="compact-xs" variant="subtle" onClick={() => openEdit(r)}>
                      <IconPencil size={13} />
                    </Button>
                    <Button size="compact-xs" variant="subtle" color="red" onClick={() => handleDelete(r)}>
                      <IconTrash size={13} />
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} size="lg"
        title={<Text fw={700} size="sm">Add scope</Text>}>
        {form}
        <Group justify="flex-end" mt={10}>
          <Button size="xs" variant="default" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button size="xs" loading={busy} disabled={!draft.label.trim()} onClick={save}
            style={{ background: '#0F2744', border: 'none' }}>Add</Button>
        </Group>
      </Modal>

      <Modal opened={!!editRow} onClose={() => setEditRow(null)} size="lg"
        title={<Text fw={700} size="sm">Edit scope</Text>}>
        {form}
        <Group justify="flex-end" mt={10}>
          <Button size="xs" variant="default" onClick={() => setEditRow(null)}>Cancel</Button>
          <Button size="xs" loading={busy} disabled={!draft.label.trim()} onClick={save}
            style={{ background: '#0F2744', border: 'none' }}>Save</Button>
        </Group>
      </Modal>
    </>
  )
}
