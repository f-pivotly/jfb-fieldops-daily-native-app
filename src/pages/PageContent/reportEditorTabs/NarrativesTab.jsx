import { Box, Text, Textarea, Stack, Group, Button, Modal, TextInput, Switch } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { IconSettings, IconTrash } from '@tabler/icons-react'
import { useDomainData } from '../../../hooks/useDomainData'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'

const DEBOUNCE_MS = 1500

// The section LIST (label/order/active) is jfb_project_report_narratives --
// one row per section, per project. The TEXT below is jfb_report_narratives --
// one row per (report, section), joined to its section by narrative_label
// (not a real FK -- there's no stable section_key in this app, so renaming a
// section in "Manage sections" orphans any content already written under the
// old label). No locking/collaboration here, unlike the non-native app --
// just a debounced autosave.
export default function NarrativesTab({ project, report }) {
  const hasProject = !!project?.id
  const hasReport = !!report?.id
  const { records, loading, error, create, update, remove } = useDomainData({
    domain: 'jfb_project_report_narratives',
    system: 'core',
    projectId: project?.id,
  })
  const { records: contentRecords, create: createContent, update: updateContent } = useDomainData({
    domain: 'jfb_report_narratives',
    system: 'core',
    projectId: project?.id,
  })
  const [managerOpen, setManagerOpen] = useState(false)

  const sections = hasProject
    ? [...records].filter((r) => r.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : []

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
        {sections.map((s) => {
          const contentRow = hasReport
            ? contentRecords.find((c) => c.report_id === report.id && c.narrative_label === s.narrative_label)
            : null
          return (
            <NarrativeSectionCard
              key={s.id}
              label={s.narrative_label}
              contentRow={contentRow}
              disabled={!hasReport}
              onSave={(text) =>
                contentRow
                  ? updateContent(contentRow.id, { content: text })
                  : createContent({ project_id: project.id, report_id: report.id, narrative_label: s.narrative_label, content: text })
              }
            />
          )
        })}
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

function NarrativeSectionCard({ label, contentRow, disabled, onSave }) {
  const [draft, setDraft] = useState(contentRow?.content ?? '')
  const [saveState, setSaveState] = useState('idle')
  const [syncedRowId, setSyncedRowId] = useState(contentRow?.id)
  const timerRef = useRef(null)

  // Re-sync from the domain when the underlying row changes (e.g. after a
  // reload brings back the row we just created) -- but not while a save is
  // pending/in-flight, so we don't clobber what's still being typed. Adjusting
  // state during render (React's documented pattern for this) instead of an
  // effect, since this is deriving state from a prop change, not reaching
  // into an external system.
  if (contentRow?.id !== syncedRowId && saveState !== 'pending' && saveState !== 'saving') {
    setSyncedRowId(contentRow?.id)
    setDraft(contentRow?.content ?? '')
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  function handleChange(next) {
    setDraft(next)
    setSaveState('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaveState('saving')
      try {
        await onSave(next)
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    }, DEBOUNCE_MS)
  }

  return (
    <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, background: '#fff' }}>
      <Group justify="space-between" mb={8}>
        <Text size="sm" fw={600}>{label}</Text>
        <SaveIndicator state={saveState} />
      </Group>
      <Textarea
        autosize
        minRows={2}
        value={draft}
        disabled={disabled}
        onChange={(e) => handleChange(e.currentTarget.value)}
        placeholder={disabled ? 'Select a report date to write a narrative…' : 'Write the narrative for this section…'}
      />
    </Box>
  )
}

function SaveIndicator({ state }) {
  switch (state) {
    case 'pending':
      return <Text size="10px" c="dimmed">…</Text>
    case 'saving':
      return <Text size="10px" c="blue">Saving</Text>
    case 'saved':
      return <Text size="10px" c="teal" fw={600}>✓ Saved</Text>
    case 'error':
      return <Text size="10px" c="red" fw={600}>⚠ Save failed</Text>
    default:
      return null
  }
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
