import { useState } from 'react'
import { Box, Text, Group, Button, Modal, TextInput, NumberInput, Select, Table } from '@mantine/core'
import { IconPencil, IconTrash, IconRefresh } from '@tabler/icons-react'
import { useProjectSiteEquipment } from '../../../hooks/useProjectSiteEquipment'
import { usePicklist } from '../../../hooks/usePicklist'
import { useConfirmDialog } from '../../../hooks/useConfirmDialog'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'

const emptyDraft = () => ({ category: 'brennan', description: '', mobilized_at: '', demobilized_at: '', sort_order: 10 })

function isOnSiteForReport(row, reportDate) {
  if (!reportDate) return true
  if (row.mobilized_at && row.mobilized_at > reportDate) return false
  if (row.demobilized_at && row.demobilized_at <= reportDate) return false
  return true
}

export default function SiteEquipmentTab({ project, reportDate }) {
  const hasProject = !!project?.id
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { siteEquipment, loading, error, creating, updating, reload, create, update, remove } =
    useProjectSiteEquipment(project?.id)
  const { values: categoryValues, labels: categoryLabels, loading: categoriesLoading } =
    usePicklist('pkl-jfb-site-equipment-category')

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(emptyDraft())
  const [editRow, setEditRow] = useState(null)
  const [formError, setFormError] = useState(null)

  const sorted = [...siteEquipment].sort(
    (a, b) => (a.category || '').localeCompare(b.category || '') || (a.sort_order ?? 0) - (b.sort_order ?? 0),
  )
  const onSiteRows = sorted.filter((r) => isOnSiteForReport(r, reportDate))
  const offSiteRows = reportDate ? sorted.filter((r) => !isOnSiteForReport(r, reportDate)) : []
  const categoryOptions = categoryValues.map((v) => ({ value: v, label: categoryLabels[v] ?? v }))

  function openAdd(category) {
    const nextSort = sorted.length === 0 ? 10 : Math.max(...sorted.map((r) => r.sort_order ?? 0)) + 10
    setAddForm({ ...emptyDraft(), category: category ?? categoryValues[0] ?? 'brennan', sort_order: nextSort })
    setFormError(null)
    setAddOpen(true)
  }

  async function saveAdd() {
    const description = addForm.description.trim()
    if (!description) {
      setFormError('Description is required.')
      return
    }
    setFormError(null)
    try {
      await create({
        project_id: project.id,
        category: addForm.category,
        description,
        sort_order: addForm.sort_order ?? 0,
        mobilized_at: addForm.mobilized_at || null,
        demobilized_at: addForm.demobilized_at || null,
      })
      setAddOpen(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add equipment.')
    }
  }

  function openEdit(row) {
    setEditRow({
      id: row.id,
      category: row.category || 'brennan',
      description: row.description || '',
      mobilized_at: row.mobilized_at || '',
      demobilized_at: row.demobilized_at || '',
      sort_order: row.sort_order ?? 0,
    })
    setFormError(null)
  }

  async function saveEdit() {
    if (!editRow) return
    const description = editRow.description.trim()
    if (!description) {
      setFormError('Description is required.')
      return
    }
    setFormError(null)
    try {
      await update(editRow.id, {
        category: editRow.category,
        description,
        sort_order: editRow.sort_order ?? 0,
        mobilized_at: editRow.mobilized_at || null,
        demobilized_at: editRow.demobilized_at || null,
      })
      setEditRow(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save equipment.')
    }
  }

  async function handleDelete(row) {
    if (!(await confirm(`Permanently delete "${row.description}"? History will be lost. To remove it from future reports instead, set a demobilization date.`))) return
    await remove(row.id)
  }

  return (
    <Box>
      <Group justify="space-between" align="flex-start" mb={4}>
        <Box>
          <Text fw={700} size="sm">Site Equipment Roster</Text>
          <Text size="xs" c="dimmed" mt={2}>
            Running list of everything on site. Add rows when equipment mobilizes; set a demobilization date when it ships off (don't delete — preserves history).
          </Text>
        </Box>
        <Box onClick={reload} style={{ cursor: 'pointer', color: '#aaa', display: 'flex', alignItems: 'center', marginTop: 2 }} title="Refresh">
          <IconRefresh size={14} />
        </Box>
      </Group>

      {loading && <LoadingSpinner py={24} />}
      {!loading && <SafeError message={error} />}

      {!loading && !error && !hasProject && (
        <Text size="xs" c="dimmed" ta="center" py={24}>
          Select a project to manage its site equipment.
        </Text>
      )}

      {!loading && !error && hasProject && categoriesLoading && <LoadingSpinner py={24} />}

      {!loading && !error && hasProject && !categoriesLoading && categoryValues.length === 0 && (
        <Text size="xs" c="dimmed" ta="center" py={24}>
          No equipment recorded yet.
        </Text>
      )}

      {!loading && !error && hasProject && !categoriesLoading && categoryValues.map((cat) => {
        const catRows = onSiteRows.filter((r) => (r.category || categoryValues[0]) === cat)
        return (
          <Box key={cat} mt={16}>
            <Group justify="space-between" mb={6}>
              <Text fw={700} size="xs" tt="uppercase" c="dimmed">{categoryLabels[cat] ?? cat}</Text>
              <Box
                onClick={() => openAdd(cat)}
                style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#1c4e9e' }}
              >
                + Add
              </Box>
            </Group>
            {catRows.length === 0 ? (
              <Text size="xs" c="dimmed" fs="italic">None added yet.</Text>
            ) : (
              <EquipmentTable rows={catRows} categoryLabels={categoryLabels} onEdit={openEdit} onDelete={handleDelete} showCategory={false} />
            )}
          </Box>
        )
      })}

      {!loading && !error && hasProject && offSiteRows.length > 0 && (
        <Box component="details" mt={12} pt={10} style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
          <Box component="summary" style={{ cursor: 'pointer', fontSize: 12, color: '#666' }}>
            Off site for this report date ({offSiteRows.length})
          </Box>
          <Text size="10px" c="dimmed" fs="italic" mt={4} mb={6}>
            These rows aren't on site on {reportDate} (mob date in the future or demob in the past). They won't render on this report's Safety page.
          </Text>
          <EquipmentTable rows={offSiteRows} categoryLabels={categoryLabels} onEdit={openEdit} onDelete={handleDelete} muted />
        </Box>
      )}

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title={<Text fw={700} size="sm">Add Equipment</Text>} size="sm">
        <SafeError message={formError} mb={8} />
        <TextInput
          label="Description"
          required
          placeholder='e.g. "3 - Kann Boats (7754, 7782, 70021)"'
          value={addForm.description}
          onChange={(e) => {
            const value = e.currentTarget.value
            setAddForm((f) => ({ ...f, description: value }))
          }}
          mb={10}
        />
        <Select
          label="Category"
          data={categoryOptions}
          value={addForm.category}
          onChange={(v) => setAddForm((f) => ({ ...f, category: v ?? categoryValues[0] ?? 'brennan' }))}
          mb={10}
        />
        <Group grow mb={10}>
          <TextInput
            label="Mobilized At"
            type="date"
            value={addForm.mobilized_at}
            onChange={(e) => { const v = e.currentTarget.value; setAddForm((f) => ({ ...f, mobilized_at: v })) }}
          />
          <TextInput
            label="Demobilized At"
            type="date"
            value={addForm.demobilized_at}
            onChange={(e) => { const v = e.currentTarget.value; setAddForm((f) => ({ ...f, demobilized_at: v })) }}
          />
        </Group>
        <NumberInput
          label="Sort Order"
          value={addForm.sort_order}
          onChange={(v) => setAddForm((f) => ({ ...f, sort_order: typeof v === 'number' ? v : 0 }))}
          mb={10}
        />
        <Group justify="flex-end" mt={10}>
          <Button variant="default" size="xs" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button size="xs" loading={creating} onClick={saveAdd} disabled={!addForm.description.trim()} style={{ background: '#0F2744', border: 'none' }}>
            Save
          </Button>
        </Group>
      </Modal>

      <Modal opened={!!editRow} onClose={() => setEditRow(null)} title={<Text fw={700} size="sm">Edit Equipment</Text>} size="sm">
        {editRow && (
          <>
            <SafeError message={formError} mb={8} />
            <TextInput
              label="Description"
              required
              value={editRow.description}
              onChange={(e) => {
                const value = e.currentTarget.value
                setEditRow((r) => ({ ...r, description: value }))
              }}
              mb={10}
            />
            <Select
              label="Category"
              data={categoryOptions}
              value={editRow.category}
              onChange={(v) => setEditRow((r) => ({ ...r, category: v ?? r.category }))}
              mb={10}
            />
            <Group grow mb={10}>
              <TextInput
                label="Mobilized At"
                type="date"
                value={editRow.mobilized_at}
                onChange={(e) => { const v = e.currentTarget.value; setEditRow((r) => ({ ...r, mobilized_at: v })) }}
              />
              <TextInput
                label="Demobilized At"
                type="date"
                value={editRow.demobilized_at}
                onChange={(e) => { const v = e.currentTarget.value; setEditRow((r) => ({ ...r, demobilized_at: v })) }}
              />
            </Group>
            <NumberInput
              label="Sort Order"
              value={editRow.sort_order}
              onChange={(v) => setEditRow((r) => ({ ...r, sort_order: typeof v === 'number' ? v : 0 }))}
              mb={10}
            />
            <Group justify="flex-end" mt={10}>
              <Button variant="default" size="xs" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button size="xs" loading={updating} onClick={saveEdit} disabled={!editRow.description.trim()} style={{ background: '#0F2744', border: 'none' }}>
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

function EquipmentTable({ rows, categoryLabels, onEdit, onDelete, muted = false, showCategory = true }) {
  return (
    <Table withTableBorder verticalSpacing="xs" fz="sm" opacity={muted ? 0.6 : 1}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Description</Table.Th>
          {showCategory && <Table.Th>Category</Table.Th>}
          <Table.Th>Mobilized</Table.Th>
          <Table.Th>Demobilized</Table.Th>
          <Table.Th>Sort</Table.Th>
          <Table.Th style={{ width: 64 }} />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row.id}>
            <Table.Td>{row.description}</Table.Td>
            {showCategory && (
              <Table.Td c="dimmed">{categoryLabels[row.category] ?? row.category ?? '—'}</Table.Td>
            )}
            <Table.Td c="dimmed">{row.mobilized_at ?? '—'}</Table.Td>
            <Table.Td c="dimmed">{row.demobilized_at ?? '—'}</Table.Td>
            <Table.Td c="dimmed">{row.sort_order ?? '—'}</Table.Td>
            <Table.Td>
              <Group gap={6} wrap="nowrap">
                <Box onClick={() => onEdit(row)} style={{ cursor: 'pointer', color: '#888', display: 'flex' }} title="Edit">
                  <IconPencil size={13} />
                </Box>
                <Box onClick={() => onDelete(row)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }} title="Delete">
                  <IconTrash size={13} />
                </Box>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}
