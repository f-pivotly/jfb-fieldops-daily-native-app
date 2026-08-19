import { Box, Text, Textarea, Stack, Group, Button, Modal, TextInput, Switch } from '@mantine/core'
import { useState } from 'react'
import { IconSettings, IconTrash } from '@tabler/icons-react'
import { useDomainData } from '../../../hooks/useDomainData'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'

// The section LIST (label/order/active) is real -- jfb_project_report_narratives.
// The actual narrative TEXT below is local-only scratch state: that domain has
// no content field, so nothing typed here is persisted yet. The previous
// mock's "locked by another user" / "use previous day's text" affordances were
// removed rather than kept as fake theater now that the section list is real.
export default function NarrativesTab({ project }) {
  const hasProject = !!project?.id
  const { records, loading, error, create, update, remove } = useDomainData({
    domain: 'jfb_project_report_narratives',
    system: 'core',
    projectId: project?.id,
  })
  const [contentByRow, setContentByRow] = useState({})
  const [managerOpen, setManagerOpen] = useState(false)

  const sections = hasProject
    ? [...records].filter((r) => r.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : []

  function setContent(id, content) {
    setContentByRow((prev) => ({ ...prev, [id]: content }))
  }

  return (
    <Box>
      <Group justify="flex-end" mb={12}>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconSettings size={12} />}
          onClick={() => setManagerOpen(true)}
          disabled={!hasProject}
        >
          Manage sections
        </Button>
      </Group>

      {loading && <LoadingSpinner py={16} />}
      {!loading && <SafeError message={error} />}
      {!loading && !error && !hasProject && (
        <Text size="xs" c="dimmed">Select a project to see its narrative sections.</Text>
      )}
      {!loading && !error && hasProject && sections.length === 0 && (
        <Text size="xs" c="dimmed">No narrative sections configured for this project yet. Use "Manage sections" to add one.</Text>
      )}

      <Stack gap="md">
        {sections.map((s) => (
          <Box key={s.id} p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, background: '#fff' }}>
            <Text size="sm" fw={600} mb={8}>{s.narrative_label}</Text>
            <Textarea
              autosize
              minRows={2}
              value={contentByRow[s.id] ?? ''}
              onChange={(e) => setContent(s.id, e.currentTarget.value)}
              placeholder="Write the narrative for this section…"
            />
          </Box>
        ))}
      </Stack>

      <SectionsManagerDialog
        opened={managerOpen}
        onClose={() => setManagerOpen(false)}
        project={project}
        records={records}
        create={create}
        update={update}
        remove={remove}
      />
    </Box>
  )
}

function SectionsManagerDialog({ opened, onClose, project, records, create, update, remove }) {
  const [newLabel, setNewLabel] = useState('')
  const rows = [...records].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  async function rename(row, label) {
    if (!label.trim() || label === row.narrative_label) return
    await update(row.id, { narrative_label: label.trim() })
  }
  async function toggleHidden(row) {
    await update(row.id, { is_active: row.is_active === false })
  }
  async function move(index, dir) {
    const target = index + dir
    if (target < 0 || target >= rows.length) return
    const a = rows[index]
    const b = rows[target]
    await Promise.all([
      update(a.id, { sort_order: b.sort_order ?? target }),
      update(b.id, { sort_order: a.sort_order ?? index }),
    ])
  }
  async function handleRemove(row) {
    if (!confirm(`Remove the "${row.narrative_label}" section?`)) return
    await remove(row.id)
  }
  async function addSection() {
    if (!newLabel.trim() || !project?.id) return
    const nextSort = rows.length === 0 ? 10 : Math.max(...rows.map((r) => r.sort_order ?? 0)) + 10
    await create({ project_id: project.id, narrative_label: newLabel.trim(), sort_order: nextSort, is_active: true })
    setNewLabel('')
  }

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700} size="sm">Manage Narrative Sections</Text>} size="md">
      <Stack gap={8} mb={16}>
        {rows.map((r, i) => (
          <Group key={r.id} gap={8} wrap="nowrap">
            <TextInput
              size="xs"
              defaultValue={r.narrative_label}
              onBlur={(e) => rename(r, e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Switch size="xs" checked={r.is_active !== false} onChange={() => toggleHidden(r)} label="Visible" />
            <Button size="xs" variant="subtle" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
            <Button size="xs" variant="subtle" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>↓</Button>
            <Box onClick={() => handleRemove(r)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }}>
              <IconTrash size={13} />
            </Box>
          </Group>
        ))}
        {rows.length === 0 && (
          <Text size="xs" c="dimmed">No sections yet — add one below.</Text>
        )}
      </Stack>
      <Group gap={8}>
        <TextInput size="xs" placeholder="New section label" value={newLabel} onChange={(e) => setNewLabel(e.currentTarget.value)} style={{ flex: 1 }} />
        <Button size="xs" onClick={addSection} disabled={!newLabel.trim()} style={{ background: '#0F2744', border: 'none' }}>Add</Button>
      </Group>
      <Group justify="flex-end" mt={16}>
        <Button size="xs" onClick={onClose} style={{ background: '#0F2744', border: 'none' }}>Done</Button>
      </Group>
    </Modal>
  )
}
