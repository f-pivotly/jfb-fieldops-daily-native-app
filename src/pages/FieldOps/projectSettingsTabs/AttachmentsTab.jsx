import { useState } from 'react'
import { Box, Text, Group, Button, Modal, TextInput, NumberInput, Switch, Table } from '@mantine/core'
import { IconPlus, IconPencil, IconTrash, IconRefresh } from '@tabler/icons-react'
import { useProjectAttachments } from '../../../hooks/useProjectAttachments'
import { useConfirmDialog } from '../../../hooks/useConfirmDialog'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'

// Field-for-field port of the non-native app's project attachments manager
// (src/components/settings/AttachmentsManager.tsx) -- a per-project list of
// equipment attachments (e.g. "3ft Cutterhead", "Env Bucket") offered as a
// dropdown when logging/editing an activity. Stored as jfb_project_attachments
// (project_id, name, sort_order, active), read by name (not FK) onto
// jfb_daily_activities.attachment / jfb_production_stats.attachment, same
// convention as pass_type.
//
// Repurposes the Project Settings "Attachments" tab, which previously held an
// unbuilt file-upload placeholder (ProjectSettingsPage.jsx's ATTACHMENTS_PLACEHOLDER) --
// unrelated feature, same name coincidentally.
export default function AttachmentsTab({ project }) {
  const hasProject = !!project?.id
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { attachments, loading, error, creating, updating, reload, create, update, remove } =
    useProjectAttachments(project?.id)

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', sort_order: 10 })
  const [editRow, setEditRow] = useState(null)
  const [formError, setFormError] = useState(null)

  const sorted = [...attachments].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  function openAdd() {
    const nextSort = sorted.length === 0 ? 10 : Math.max(...sorted.map((a) => a.sort_order ?? 0)) + 10
    setAddForm({ name: '', sort_order: nextSort })
    setFormError(null)
    setAddOpen(true)
  }

  async function saveAdd() {
    const name = addForm.name.trim()
    if (!name) {
      setFormError('Name is required.')
      return
    }
    setFormError(null)
    try {
      await create({ project_id: project.id, name, sort_order: addForm.sort_order ?? 0, active: true })
      setAddOpen(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add attachment.')
    }
  }

  function openEdit(row) {
    setEditRow({ id: row.id, name: row.name, sort_order: row.sort_order ?? 0, active: row.active !== false })
    setFormError(null)
  }

  async function saveEdit() {
    if (!editRow) return
    const name = editRow.name.trim()
    if (!name) {
      setFormError('Name is required.')
      return
    }
    setFormError(null)
    try {
      await update(editRow.id, { name, sort_order: editRow.sort_order ?? 0, active: editRow.active })
      setEditRow(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save attachment.')
    }
  }

  async function toggleActive(row) {
    await update(row.id, { active: !(row.active !== false) })
  }

  async function handleDelete(row) {
    if (!(await confirm(`Delete "${row.name}"? Activities that already reference this name keep it -- only the picker option is removed.`))) return
    await remove(row.id)
  }

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text fw={700} size="sm">Attachments</Text>
        <Group gap={8}>
          <Box onClick={reload} style={{ cursor: 'pointer', color: '#aaa', display: 'flex', alignItems: 'center' }} title="Refresh">
            <IconRefresh size={14} />
          </Box>
          <Button
            size="xs"
            leftSection={<IconPlus size={12} />}
            onClick={openAdd}
            disabled={!hasProject}
            title={hasProject ? undefined : 'Select a project to manage its attachments'}
            style={{ background: '#0F2744', border: 'none' }}
          >
            Add Attachment
          </Button>
        </Group>
      </Group>

      {loading && <LoadingSpinner py={24} />}
      {!loading && <SafeError message={error} />}

      {!loading && !error && !hasProject && (
        <Text size="xs" c="dimmed" ta="center" py={24}>
          Select a project to manage its attachments.
        </Text>
      )}

      {!loading && !error && hasProject && sorted.length === 0 && (
        <Text size="xs" c="dimmed" ta="center" py={24}>
          No attachments configured yet.
        </Text>
      )}

      {!loading && !error && hasProject && sorted.length > 0 && (
        <Table withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Sort Order</Table.Th>
              <Table.Th>Active</Table.Th>
              <Table.Th style={{ width: 64 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>{row.name}</Table.Td>
                <Table.Td c="dimmed">{row.sort_order ?? '—'}</Table.Td>
                <Table.Td>
                  <Switch size="xs" checked={row.active !== false} onChange={() => toggleActive(row)} />
                </Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <Box onClick={() => openEdit(row)} style={{ cursor: 'pointer', color: '#888', display: 'flex' }} title="Edit">
                      <IconPencil size={13} />
                    </Box>
                    <Box onClick={() => handleDelete(row)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }} title="Delete">
                      <IconTrash size={13} />
                    </Box>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title={<Text fw={700} size="sm">Add Attachment</Text>} size="sm">
        <SafeError message={formError} mb={8} />
        <TextInput
          label="Name"
          required
          placeholder="e.g. 3ft Cutterhead, Env Bucket"
          value={addForm.name}
          onChange={(e) => setAddForm((f) => ({ ...f, name: e.currentTarget.value }))}
          mb={10}
        />
        <NumberInput
          label="Sort Order"
          value={addForm.sort_order}
          onChange={(v) => setAddForm((f) => ({ ...f, sort_order: typeof v === 'number' ? v : 0 }))}
          mb={10}
        />
        <Group justify="flex-end" mt={10}>
          <Button variant="default" size="xs" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button size="xs" loading={creating} onClick={saveAdd} disabled={!addForm.name.trim()} style={{ background: '#0F2744', border: 'none' }}>
            Save
          </Button>
        </Group>
      </Modal>

      <Modal opened={!!editRow} onClose={() => setEditRow(null)} title={<Text fw={700} size="sm">Edit Attachment</Text>} size="sm">
        {editRow && (
          <>
            <SafeError message={formError} mb={8} />
            <TextInput
              label="Name"
              required
              value={editRow.name}
              onChange={(e) => setEditRow((r) => ({ ...r, name: e.currentTarget.value }))}
              mb={10}
            />
            <NumberInput
              label="Sort Order"
              value={editRow.sort_order}
              onChange={(v) => setEditRow((r) => ({ ...r, sort_order: typeof v === 'number' ? v : 0 }))}
              mb={10}
            />
            <Switch
              label="Active"
              checked={editRow.active}
              onChange={(e) => setEditRow((r) => ({ ...r, active: e.currentTarget.checked }))}
              mb={10}
            />
            <Group justify="flex-end" mt={10}>
              <Button variant="default" size="xs" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button size="xs" loading={updating} onClick={saveEdit} disabled={!editRow.name.trim()} style={{ background: '#0F2744', border: 'none' }}>
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
