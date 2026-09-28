import { useState } from 'react'
import { Box, Text, Group, Button, Modal, TextInput, NumberInput, Select, Checkbox, Table } from '@mantine/core'
import { IconPlus, IconRefresh } from '@tabler/icons-react'
import { useMetrics } from '../../../hooks/metrics/useMetrics'
import { useMetricSources } from '../../../hooks/metrics/useMetricSources'
import { useMetricDefaults } from '../../../hooks/metrics/useMetricDefaults'
import { useEquipment } from '../../../hooks/project/useEquipment'
import { usePicklist } from '../../../hooks/core/usePicklist'
import { useConfirmDialog } from '../../../hooks/ui/useConfirmDialog'
import { useFieldOpsDomainAccess, useFieldOpsAction } from '../../../contexts/fieldOpsAccessContext'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'
import PaginationBar from '../../../components/PaginationBar'
import { usePagedRows } from '../../../hooks/ui/usePagedRows'

function slugify(label) {
  const trimmed = label.trim().toLowerCase()
  let result = ''
  let lastWasSeparator = true
  for (const ch of trimmed) {
    const isAlnum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')
    if (isAlnum) {
      result += ch
      lastWasSeparator = false
    } else if (!lastWasSeparator) {
      result += '_'
      lastWasSeparator = true
    }
  }
  if (result.endsWith('_')) result = result.slice(0, -1)
  return result || 'metric'
}

function sanitizeMetricKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9_]+/g, '_')
}

function uniqueMetricKey(label, existingKeys) {
  const used = new Set(existingKeys)
  const base = slugify(label)
  let key = base
  let n = 2
  while (used.has(key)) {
    key = `${base}_${n}`
    n++
  }
  return key
}

const emptyDraft = () => ({ metric_key: '', label: '', source: 'manual', equipment_id: null, unit: '', rollup_type: 'sum', sort_order: 10 })

const DEFAULT_ROLLUP_OPTIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average (non-zero days)' },
]

export default function CoverMetricsTab({ project }) {
  const hasProject = !!project?.id
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { metrics, loading, error, creating, updating, reload, create, update, remove } = useMetrics(project?.id)
  const { metricSources } = useMetricSources()
  const { metricDefaults } = useMetricDefaults()
  const { equipment } = useEquipment(project?.id)
  const { canCreate, canUpdate, canDelete } = useFieldOpsDomainAccess('jfb_metrics')
  const canManageSourceType = useFieldOpsAction('manage_metric_source_type')
  const [seeding, setSeeding] = useState(false)

  const activeSources = metricSources.filter((m) => m.active !== false)
  const sourceOptions = [
    { value: 'manual', label: 'Manual (PE enters daily)' },
    ...activeSources.filter((m) => m.value !== 'manual').map((m) => ({ value: m.value, label: m.label ?? m.value })),
  ]
  const sourceLabel = (v) => sourceOptions.find((o) => o.value === v)?.label ?? v ?? '—'
  const { values: rollupValues, labels: rollupLabels } = usePicklist('pkl-jfb-metric-rollup')
  const rollupOptions = rollupValues.length
    ? rollupValues.map((v) => ({ value: v, label: rollupLabels[v] ?? v }))
    : DEFAULT_ROLLUP_OPTIONS
  const equipmentOptions = [
    { value: '', label: 'All equipment' },
    ...equipment.map((eq) => ({ value: eq.id, label: eq.name })),
  ]

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(emptyDraft())
  const [editRow, setEditRow] = useState(null)
  const [formError, setFormError] = useState(null)

  const sorted = [...metrics].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const { pageRows: sortedPageRows, page: sortedPage, setPage: setSortedPage, total: sortedTotal, pageSize: sortedPageSize } = usePagedRows(sorted)
  const addKey = (addForm.metric_key ?? '').replace(/^_+|_+$/g, '')
  const addKeyTaken = !!addKey && metrics.some((m) => m.metric_key === addKey)

  function handleMetricKeyBlur() {
    if (!addForm.metric_key && addForm.label.trim()) {
      const key = uniqueMetricKey(addForm.label, metrics.map((m) => m.metric_key).filter(Boolean))
      setAddForm((f) => ({ ...f, metric_key: key }))
    } else if (addForm.metric_key) {
      setAddForm((f) => ({ ...f, metric_key: slugify(f.metric_key) }))
    }
  }

  function openAdd() {
    const nextSort = sorted.length === 0 ? 10 : Math.max(...sorted.map((r) => r.sort_order ?? 0)) + 10
    setAddForm({ ...emptyDraft(), sort_order: nextSort })
    setFormError(null)
    setAddOpen(true)
  }

  async function saveAdd() {
    const label = addForm.label.trim()
    if (!addKey) {
      setFormError('Metric key is required.')
      return
    }
    if (addKeyTaken) {
      setFormError(`A metric with key "${addKey}" already exists.`)
      return
    }
    if (!label) {
      setFormError('Label is required.')
      return
    }
    setFormError(null)
    try {
      await create({
        project_id: project.id,
        metric_key: addKey,
        label,
        source: addForm.source,
        equipment_id: addForm.source === 'manual' ? null : addForm.equipment_id || null,
        unit: addForm.unit || null,
        rollup_type: addForm.source === 'manual' && addForm.rollup_type === 'avg' ? 'avg' : 'sum',
        sort_order: addForm.sort_order ?? 0,
        active: true,
      })
      setAddOpen(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add metric.')
    }
  }

  function openEdit(row) {
    setEditRow({
      id: row.id,
      metric_key: row.metric_key || '',
      label: row.label || '',
      source: row.source || 'manual',
      equipment_id: row.equipment_id || null,
      unit: row.unit || '',
      rollup_type: row.rollup_type === 'avg' ? 'avg' : 'sum',
      sort_order: row.sort_order ?? 0,
      active: row.active !== false,
    })
    setFormError(null)
  }

  async function saveEdit() {
    if (!editRow) return
    const label = editRow.label.trim()
    if (!label) {
      setFormError('Label is required.')
      return
    }
    setFormError(null)
    const data = {
      label,
      unit: editRow.unit || null,
      rollup_type: editRow.source === 'manual' && editRow.rollup_type === 'avg' ? 'avg' : 'sum',
      sort_order: editRow.sort_order ?? 0,
      active: editRow.active,
    }
    if (canManageSourceType) {
      data.source = editRow.source
      data.equipment_id = editRow.source === 'manual' ? null : editRow.equipment_id || null
    }
    try {
      await update(editRow.id, data)
      setEditRow(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save metric.')
    }
  }

  async function handleSeedDefaults() {
    setSeeding(true)
    setFormError(null)
    try {
      for (const d of metricDefaults) {
        await create({
          project_id: project.id,
          metric_key: d.metric_key,
          label: d.label,
          source: d.source,
          equipment_id: null,
          unit: d.unit || null,
          sort_order: d.sort_order ?? 0,
          active: true,
        })
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to seed defaults.')
    } finally {
      setSeeding(false)
    }
  }

  async function toggleActive(row) {
    await update(row.id, { active: !row.active })
  }

  async function handleDelete(row) {
    if (!(await confirm(`Remove "${row.label}" from Cover Metrics? Past report values are not affected.`))) return
    await remove(row.id)
  }

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text fw={700} size="sm">Cover Metrics</Text>
        <Group gap={8}>
          <Box onClick={reload} style={{ cursor: 'pointer', color: '#aaa', display: 'flex', alignItems: 'center' }} title="Refresh">
            <IconRefresh size={14} />
          </Box>
          {canCreate && (
            <Button
              size="xs"
              leftSection={<IconPlus size={12} />}
              onClick={openAdd}
              disabled={!hasProject}
              title={hasProject ? undefined : 'Select a project to manage its cover metrics'}
              style={{ background: '#0F2744', border: 'none' }}
            >
              Add Metric
            </Button>
          )}
        </Group>
      </Group>

      {loading && <LoadingSpinner py={24} />}
      {!loading && <SafeError message={error} />}

      {!loading && !error && !hasProject && (
        <Text size="xs" c="dimmed" ta="center" py={24}>
          Select a project to manage its cover metrics.
        </Text>
      )}

      {!loading && !error && hasProject && sorted.length === 0 && (
        <Box style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }} py={24} ta="center">
          <Text size="xs" c="dimmed" mb={canCreate && metricDefaults.length > 0 ? 10 : 0}>
            No metrics configured yet.{canCreate ? ' Click + Add Metric to start.' : ''}
          </Text>
          {canCreate && metricDefaults.length > 0 && (
            <Button size="xs" variant="default" loading={seeding} onClick={handleSeedDefaults}>
              Seed from defaults
            </Button>
          )}
        </Box>
      )}

      {!loading && !error && hasProject && sorted.length > 0 && (
        <>
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Metric Key</Table.Th>
              <Table.Th>Metric</Table.Th>
              <Table.Th>Source</Table.Th>
              <Table.Th>Unit</Table.Th>
              <Table.Th>Order</Table.Th>
              <Table.Th>Active</Table.Th>
              <Table.Th style={{ width: 140 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sortedPageRows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.metric_key || '—'}</Table.Td>
                <Table.Td>{row.label}</Table.Td>
                <Table.Td c="dimmed">{sourceLabel(row.source)}</Table.Td>
                <Table.Td c="dimmed">{row.unit ?? '—'}</Table.Td>
                <Table.Td c="dimmed">{row.sort_order ?? '—'}</Table.Td>
                <Table.Td>
                  <Checkbox
                    size="xs"
                    checked={row.active !== false}
                    label={row.active !== false ? 'Active' : 'Hidden'}
                    onChange={() => toggleActive(row)}
                    disabled={!canUpdate}
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap={10} wrap="nowrap">
                    {canUpdate && (
                      <Button size="xs" variant="subtle" onClick={() => openEdit(row)}>Edit</Button>
                    )}
                    {canDelete && (
                      <Button size="xs" variant="subtle" color="red" onClick={() => handleDelete(row)}>Delete</Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <PaginationBar page={sortedPage} pageSize={sortedPageSize} count={sortedPageRows.length} total={sortedTotal} onChange={setSortedPage} noun="metric" />
        </>
      )}

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title={<Text fw={700} size="sm">Add Metric</Text>} size="sm">
        <SafeError message={formError} mb={8} />
        <TextInput
          label="Metric Key"
          required
          placeholder="lowercase_with_underscores"
          description="Stable identifier. Cannot change after creation."
          inputWrapperOrder={['label', 'input', 'description', 'error']}
          value={addForm.metric_key}
          onChange={(e) => { const v = sanitizeMetricKey(e.currentTarget.value); setAddForm((f) => ({ ...f, metric_key: v })) }}
          onBlur={handleMetricKeyBlur}
          error={addKeyTaken ? `A metric with key "${addKey}" already exists.` : undefined}
          styles={{ input: { fontFamily: 'monospace' } }}
          mb={10}
          autoFocus
        />
        <TextInput
          label="Label"
          required
          placeholder="Display name on the cover page"
          value={addForm.label}
          onChange={(e) => { const v = e.currentTarget.value; setAddForm((f) => ({ ...f, label: v })) }}
          mb={10}
        />
        <Select
          label="Source"
          data={sourceOptions}
          value={addForm.source}
          onChange={(v) => setAddForm((f) => ({ ...f, source: v ?? 'manual' }))}
          mb={10}
        />
        {addForm.source !== 'manual' && (
          <Select
            label="Equipment"
            description="Which unit this Auto metric sums. Leave as All equipment for a project-wide total."
            data={equipmentOptions}
            value={addForm.equipment_id ?? ''}
            onChange={(v) => setAddForm((f) => ({ ...f, equipment_id: v || null }))}
            mb={10}
          />
        )}
        {addForm.source === 'manual' && (
          <Select
            label="Week / Total roll-up"
            description="Sum for volumes, areas and hours. Average for readings such as turbidity or flow rate; days with no reading (blank or 0) are skipped."
            data={rollupOptions}
            value={addForm.rollup_type}
            onChange={(v) => setAddForm((f) => ({ ...f, rollup_type: v ?? 'sum' }))}
            allowDeselect={false}
            mb={10}
          />
        )}
        <Group grow mb={10}>
          <TextInput
            label="Unit"
            value={addForm.unit}
            onChange={(e) => { const v = e.currentTarget.value; setAddForm((f) => ({ ...f, unit: v })) }}
          />
          <NumberInput
            label="Sort Order"
            value={addForm.sort_order}
            onChange={(v) => setAddForm((f) => ({ ...f, sort_order: typeof v === 'number' ? v : 0 }))}
          />
        </Group>
        <Group justify="flex-end" mt={10}>
          <Button variant="default" size="xs" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button size="xs" loading={creating} onClick={saveAdd} disabled={!addKey || addKeyTaken || !addForm.label.trim()} style={{ background: '#0F2744', border: 'none' }}>
            Save
          </Button>
        </Group>
      </Modal>

      <Modal opened={!!editRow} onClose={() => setEditRow(null)} title={<Text fw={700} size="sm">Edit Metric</Text>} size="sm">
        {editRow && (
          <>
            <SafeError message={formError} mb={8} />
            <TextInput
              label="Metric Key"
              description="Immutable after creation."
              inputWrapperOrder={['label', 'input', 'description']}
              value={editRow.metric_key}
              readOnly
              disabled
              styles={{ input: { fontFamily: 'monospace' } }}
              mb={10}
            />
            <TextInput
              label="Label"
              required
              value={editRow.label}
              onChange={(e) => { const v = e.currentTarget.value; setEditRow((r) => ({ ...r, label: v })) }}
              mb={10}
            />
            <Select
              label="Source"
              data={sourceOptions}
              value={editRow.source}
              onChange={(v) => setEditRow((r) => ({ ...r, source: v ?? 'manual' }))}
              disabled={!canManageSourceType}
              description={canManageSourceType ? undefined : "Only a director or admin can change a metric's source."}
              mb={10}
            />
            {editRow.source !== 'manual' && canManageSourceType && (
              <Select
                label="Equipment"
                data={equipmentOptions}
                value={editRow.equipment_id ?? ''}
                onChange={(v) => setEditRow((r) => ({ ...r, equipment_id: v || null }))}
                mb={10}
              />
            )}
            {editRow.source === 'manual' && (
              <Select
                label="Week / Total roll-up"
                description="Sum for volumes, areas and hours. Average for readings such as turbidity or flow rate; days with no reading (blank or 0) are skipped."
                data={rollupOptions}
                value={editRow.rollup_type}
                onChange={(v) => setEditRow((r) => ({ ...r, rollup_type: v ?? 'sum' }))}
                allowDeselect={false}
                mb={10}
              />
            )}
            <Group grow mb={10}>
              <TextInput
                label="Unit"
                value={editRow.unit}
                onChange={(e) => { const v = e.currentTarget.value; setEditRow((r) => ({ ...r, unit: v })) }}
              />
              <NumberInput
                label="Sort Order"
                value={editRow.sort_order}
                onChange={(v) => setEditRow((r) => ({ ...r, sort_order: typeof v === 'number' ? v : 0 }))}
              />
            </Group>
            <Checkbox
              mb={10}
              checked={editRow.active}
              onChange={() => setEditRow((r) => ({ ...r, active: !r.active }))}
              label="Active"
            />
            <Group justify="flex-end" mt={10}>
              <Button variant="default" size="xs" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button size="xs" loading={updating} onClick={saveEdit} disabled={!editRow.label.trim()} style={{ background: '#0F2744', border: 'none' }}>
                Save
              </Button>
            </Group>
          </>
        )}
      </Modal>

      {confirmModal}
    </Box>
  )
}
