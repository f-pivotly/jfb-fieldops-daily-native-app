import { useState } from 'react'
import { Box, Text, Group, Button, Table, Modal, TextInput, Badge } from '@mantine/core'
import { IconPlus, IconRefresh, IconPencil } from '@tabler/icons-react'
import { useOfflinePersonRoster } from '../../hooks/useOfflinePersonRoster'
import StatusPill from '../../components/StatusPill'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function CrewRosterPage({ domain, system, actions = [] }) {
  const isEnabled = (key) => {
    const match = actions.find((a) => a.action_key === key)
    return match ? match.enabled : true
  }
  const canCreate = isEnabled('create_record')
  const canUpdate = isEnabled('update_record')

  const {
    records,
    loading,
    isOnline,
    cachedOnly,
    lastSyncedAt,
    pendingCount,
    failedCount,
    statusByLocalId,
    createPerson,
    updatePerson,
    retryFailed,
  } = useOfflinePersonRoster({ domain, system })

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [editName, setEditName] = useState('')

  async function handleCreate() {
    if (!createName.trim()) return
    await createPerson(createName.trim())
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
    await updatePerson(editRow.local_id, { name: editName.trim() })
    setEditOpen(false)
    setEditRow(null)
  }

  return (
    <Box style={{ background: '#fff', border: '1px solid #ebebeb', borderRadius: 6, overflow: 'hidden', margin: 16 }}>
      <Box px={16} py={10} style={{ background: '#f9f9f9', borderBottom: '1px solid #ebebeb' }}>
        <Group justify="space-between" align="center">
          <Group gap={10}>
            <Text size="xs" fw={700} style={{ letterSpacing: '1px', textTransform: 'uppercase', color: '#888' }}>
              Crew Roster
            </Text>
            <StatusPill val={isOnline ? 'Online' : 'Offline'} />
            {pendingCount > 0 && (
              <Badge size="xs" color="yellow" variant="light">{pendingCount} pending</Badge>
            )}
            {failedCount > 0 && (
              <Badge size="xs" color="red" variant="light">{failedCount} failed</Badge>
            )}
          </Group>
          {canCreate && (
            <Button
              size="xs"
              leftSection={<IconPlus size={12} />}
              onClick={() => setCreateOpen(true)}
              style={{ background: '#dc2626', border: 'none', fontSize: 12 }}
            >
              Add Crew Member
            </Button>
          )}
        </Group>
        {cachedOnly && (
          <Text size="xs" c="#b45309" mt={6}>
            Showing cached data{lastSyncedAt ? ` — last synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : ''}.
          </Text>
        )}
      </Box>

      <Box p={16}>
        {loading && <LoadingSpinner py={24} />}
        {!loading && records.length === 0 && (
          <Text size="xs" c="#aaa" ta="center" py={24}>No crew members yet</Text>
        )}
        {!loading && records.length > 0 && (
          <Box style={{ overflowX: 'auto' }}>
            <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: 12, minWidth: 400 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.5px', color: '#888', fontWeight: 700 }}>Name</Table.Th>
                  <Table.Th style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.5px', color: '#888', fontWeight: 700 }}>Status</Table.Th>
                  <Table.Th style={{ width: 80 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {records.map((row) => {
                  const status = statusByLocalId[row.local_id] ?? 'Synced'
                  return (
                    <Table.Tr key={row.local_id}>
                      <Table.Td style={{ color: '#333' }}>{row.name}</Table.Td>
                      <Table.Td><StatusPill val={status} /></Table.Td>
                      <Table.Td>
                        <Group gap={6} justify="center">
                          {canUpdate && (
                            <Box onClick={() => openEdit(row)} style={{ cursor: 'pointer', color: '#888', display: 'flex', alignItems: 'center' }} title="Edit">
                              <IconPencil size={13} />
                            </Box>
                          )}
                          {status === 'Failed' && (
                            <Box onClick={() => retryFailed(row.local_id)} style={{ cursor: 'pointer', color: '#2563eb', display: 'flex', alignItems: 'center' }} title="Retry now">
                              <IconRefresh size={13} />
                            </Box>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Box>
        )}
      </Box>

      <Modal
        opened={createOpen}
        onClose={() => { setCreateOpen(false); setCreateName('') }}
        title={<Text fw={700} size="sm">Add Crew Member</Text>}
        size="sm"
      >
        <TextInput
          label="Name"
          placeholder="Enter name"
          value={createName}
          onChange={(e) => setCreateName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          mb={16}
          autoFocus
        />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => { setCreateOpen(false); setCreateName('') }}>Cancel</Button>
          <Button size="xs" onClick={handleCreate} disabled={!createName.trim()} style={{ background: '#dc2626', border: 'none' }}>
            Add
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={editOpen}
        onClose={() => { setEditOpen(false); setEditRow(null) }}
        title={<Text fw={700} size="sm">Edit Crew Member</Text>}
        size="sm"
      >
        <TextInput
          label="Name"
          value={editName}
          onChange={(e) => setEditName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
          mb={16}
          autoFocus
        />
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => { setEditOpen(false); setEditRow(null) }}>Cancel</Button>
          <Button size="xs" onClick={handleEdit} disabled={!editName.trim()} style={{ background: '#dc2626', border: 'none' }}>
            Save
          </Button>
        </Group>
      </Modal>
    </Box>
  )
}
