import { useState } from 'react'
import { Box, Text, Group, Button, Table, Modal, TextInput } from '@mantine/core'
import { IconPlus, IconRefresh, IconPencil, IconTrash } from '@tabler/icons-react'
import { useDomainData } from '../hooks/useDomainData'
import LoadingSpinner from './LoadingSpinner'
import SafeError from './SafeError'

export default function DomainDataTable({ domain, system, actions = [] }) {
  const isEnabled = (key) => {
    const match = actions.find(a => a.action_key === key)
    return match ? match.enabled : true
  }
  const canCreate = isEnabled('create_record')
  const canUpdate = isEnabled('update_record')
  const canDelete = isEnabled('delete_record')
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } = useDomainData({ domain, system })

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [editName, setEditName] = useState('')

  const [deleteRow, setDeleteRow] = useState(null)

  async function handleCreate() {
    if (!createName.trim()) return
    await create({ name: createName.trim() })
    setCreateName('')
    setCreateOpen(false)
  }

  function openEdit(row) {
    setEditRow(row)
    setEditName(row.name ?? '')
    setEditOpen(true)
  }

  async function handleEdit() {
    if (!editName.trim() || !editRow) return
    await update(editRow.id, { name: editName.trim() })
    setEditOpen(false)
    setEditRow(null)
  }

  async function handleDelete() {
    if (!deleteRow) return
    await remove(deleteRow.id)
    setDeleteRow(null)
  }

  const columns = records.length > 0
    ? Object.keys(records[0]).filter(k => !k.startsWith('_'))
    : []

  return (
    <Box style={{ background: '#fff', border: '1px solid #ebebeb', borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
      <Box px={16} py={10} style={{ background: '#f9f9f9', borderBottom: '1px solid #ebebeb' }}>
        <Group justify="space-between" align="center">
          <Text size="xs" fw={700} style={{ letterSpacing: '1px', textTransform: 'uppercase', color: '#888' }}>
            {domain} — Data
          </Text>
          <Group gap={8}>
            <Box onClick={reload} style={{ cursor: 'pointer', color: '#aaa', display: 'flex', alignItems: 'center' }}>
              <IconRefresh size={13} />
            </Box>
            {canCreate && (
              <Button
                size="xs"
                leftSection={<IconPlus size={12} />}
                onClick={() => setCreateOpen(true)}
                style={{ background: '#0F2744', border: 'none', fontSize: 12 }}
              >
                New Record
              </Button>
            )}
          </Group>
        </Group>
      </Box>

      <Box p={16}>
        {loading && <LoadingSpinner py={24} />}
        {!loading && <SafeError message={error} />}
        {!loading && !error && records.length === 0 && (
          <Text size="xs" c="#aaa" ta="center" py={24}>No records found</Text>
        )}
        {!loading && !error && records.length > 0 && (
          <Box style={{ overflowX: 'auto' }}>
            <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: 12, minWidth: 400 }}>
              <Table.Thead>
                <Table.Tr>
                  {columns.map(col => (
                    <Table.Th key={col} style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                      {col}
                    </Table.Th>
                  ))}
                  <Table.Th style={{ width: 64 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {records.map((row, i) => (
                  <Table.Tr key={row.id ?? i}>
                    {columns.map(col => (
                      <Table.Td key={col} style={{ color: '#333', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row[col] == null ? '—' : String(row[col])}
                      </Table.Td>
                    ))}
                    <Table.Td>
                      <Group gap={4} justify="center">
                        {canUpdate && (
                          <Box
                            onClick={() => openEdit(row)}
                            style={{ cursor: 'pointer', color: '#888', display: 'flex', alignItems: 'center' }}
                          >
                            <IconPencil size={13} />
                          </Box>
                        )}
                        {canDelete && (
                          <Box
                            onClick={() => setDeleteRow(row)}
                            style={{ cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center' }}
                          >
                            <IconTrash size={13} />
                          </Box>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        )}
      </Box>

      <Modal
        opened={createOpen}
        onClose={() => { setCreateOpen(false); setCreateName('') }}
        title={<Text fw={700} size="sm">New Record — {domain}</Text>}
        size="sm"
      >
        <TextInput
          label="Name"
          placeholder="Enter name"
          value={createName}
          onChange={e => setCreateName(e.currentTarget.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          mb={16}
          autoFocus
        />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => { setCreateOpen(false); setCreateName('') }}>Cancel</Button>
          <Button size="xs" loading={creating} onClick={handleCreate} disabled={!createName.trim()} style={{ background: '#0F2744', border: 'none' }}>
            Create
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={editOpen}
        onClose={() => { setEditOpen(false); setEditRow(null) }}
        title={<Text fw={700} size="sm">Edit Record — {domain}</Text>}
        size="sm"
      >
        <TextInput
          label="Name"
          placeholder="Enter name"
          value={editName}
          onChange={e => setEditName(e.currentTarget.value)}
          onKeyDown={e => e.key === 'Enter' && handleEdit()}
          mb={16}
          autoFocus
        />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => { setEditOpen(false); setEditRow(null) }}>Cancel</Button>
          <Button size="xs" loading={updating} onClick={handleEdit} disabled={!editName.trim()} style={{ background: '#0F2744', border: 'none' }}>
            Save
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        title={<Text fw={700} size="sm">Delete Record</Text>}
        size="sm"
      >
        <Text size="sm" mb={16}>Are you sure you want to delete this record? This cannot be undone.</Text>
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setDeleteRow(null)}>Cancel</Button>
          <Button size="xs" loading={deleting} onClick={handleDelete} style={{ background: '#dc2626', border: 'none' }}>
            Delete
          </Button>
        </Group>
      </Modal>
    </Box>
  )
}
