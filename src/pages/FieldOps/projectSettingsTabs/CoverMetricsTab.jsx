import { useState } from 'react'
import { Box, Text, Group, Button, Modal, TextInput, NumberInput, Select, Switch, Table } from '@mantine/core'
import { IconPlus, IconPencil, IconTrash, IconRefresh } from '@tabler/icons-react'
import { useMetrics } from '../../../hooks/useMetrics'
import { useMetricSources } from '../../../hooks/useMetricSources'
import { useEquipment } from '../../../hooks/useEquipment'
import { useConfirmDialog } from '../../../hooks/useConfirmDialog'
import { useFieldOpsDomainAccess, useFieldOpsAction } from '../../../contexts/fieldOpsAccessContext'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'

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

const emptyDraft = () => ({ label: '', source: 'manual', equipment_id: null, unit: '', sort_order: 10 })

export default function CoverMetricsTab({ project }) {
  const hasProject = !!project?.id
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { metrics, loading, error, creating, updating, reload, create, update, remove } = useMetrics(project?.id)
  const { metricSources } = useMetricSources()
  const { equipment } = useEquipment(project?.id)
  const { canCreate, canUpdate, canDelete } = useFieldOpsDomainAccess('jfb_metrics')
  const canManageSourceType = useFieldOpsAction('manage_metric_source_type')

  const activeSources = metricSources.filter((m) => m.active !== false)
  const sourceOptions = [
    { value: 'manual', label: 'Manual (PE enters daily)' },
    ...activeSources.filter((m) => m.value !== 'manual').map((m) => ({ value: m.value, label: m.label ?? m.value })),
  ]
  const sourceLabel = (v) => sourceOptions.find((o) => o.value === v)?.label ?? v ?? '—'
  const equipmentOptions = [
    { value: '', label: 'All equipment' },
    ...equipment.map((eq) => ({ value: eq.id, label: eq.name })),
  ]

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(emptyDraft())
  const [editRow, setEditRow] = useState(null)
  const [formError, setFormError] = useState(null)

  const sorted = [...metrics].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  function openAdd() {
    const nextSort = sorted.length === 0 ? 10 : Math.max(...sorted.map((r) => r.sort_order ?? 0)) + 10
    setAddForm({ ...emptyDraft(), sort_order: nextSort })
    setFormError(null)
    setAddOpen(true)
  }

  async function saveAdd() {
    const label = addForm.label.trim()
    if (!label) {
      setFormError('Label is required.')
      return
    }
    setFormError(null)
    try {
      await create({
        project_id: project.id,
        metric_key: slugify(label),
        label,
        source: addForm.source,
        equipment_id: addForm.source === 'manual' ? null : addForm.equipment_id || null,
        unit: addForm.unit || null,
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
      label: row.label || '',
      source: row.source || 'manual',
      equipment_id: row.equipment_id || null,
      unit: row.unit || '',
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
        <Text size="xs" c="dimmed" ta="center" py={24}>
          No metrics configured yet.
        </Text>
      )}

      {!loading && !error && hasProject && sorted.length > 0 && (
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Metric</Table.Th>
              <Table.Th>Source</Table.Th>
              <Table.Th>Unit</Table.Th>
              <Table.Th>Order</Table.Th>
              <Table.Th>Active</Table.Th>
              <Table.Th style={{ width: 64 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>{row.label}</Table.Td>
                <Table.Td c="dimmed">{sourceLabel(row.source)}</Table.Td>
                <Table.Td c="dimmed">{row.unit ?? '—'}</Table.Td>
                <Table.Td c="dimmed">{row.sort_order ?? '—'}</Table.Td>
                <Table.Td>
                  <Switch size="xs" checked={row.active !== false} onChange={() => toggleActive(row)} disabled={!canUpdate} />
                </Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    {canUpdate && (
                      <Box onClick={() => openEdit(row)} style={{ cursor: 'pointer', color: '#888', display: 'flex' }} title="Edit">
                        <IconPencil size={13} />
                      </Box>
                    )}
                    {canDelete && (
                      <Box onClick={() => handleDelete(row)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }} title="Delete">
                        <IconTrash size={13} />
                      </Box>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title={<Text fw={700} size="sm">Add Metric</Text>} size="sm">
        <SafeError message={formError} mb={8} />
        <TextInput
          label="Label"
          required
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
          <Button size="xs" loading={creating} onClick={saveAdd} disabled={!addForm.label.trim()} style={{ background: '#0F2744', border: 'none' }}>
            Save
          </Button>
        </Group>
      </Modal>

      <Modal opened={!!editRow} onClose={() => setEditRow(null)} title={<Text fw={700} size="sm">Edit Metric</Text>} size="sm">
        {editRow && (
          <>
            <SafeError message={formError} mb={8} />
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
            <Switch
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
