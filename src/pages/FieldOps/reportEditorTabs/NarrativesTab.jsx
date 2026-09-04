import { Box, Text, Textarea, Stack, Group, Button, Modal, TextInput, Switch, Grid } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { IconSettings, IconTrash, IconRefresh } from '@tabler/icons-react'
import { useDomainData } from '../../../hooks/useDomainData'
import { useConfirmDialog } from '../../../hooks/useConfirmDialog'
import { useFieldOpsDomainAccess } from '../../../contexts/fieldOpsAccessContext'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'
import NarrativeContextPanel from './NarrativeContextPanel'

const DEBOUNCE_MS = 1500

export default function NarrativesTab({ project, report, equipment = [] }) {
  const hasProject = !!project?.id
  const hasReport = !!report?.id

  const { records, loading, error, create, update, remove, reload: reloadSections } = useDomainData({
    domain: 'jfb_project_report_narratives',
    system: 'core',
    projectId: project?.id,
  })
  const { records: contentRows, create: createContent, update: updateContent, reload: reloadContent } = useDomainData({
    domain: 'jfb_report_narratives_v2',
    system: 'core',
    projectId: project?.id,
  })
  const { canCreate: canAddSections, canUpdate: canEditSections } = useFieldOpsDomainAccess('jfb_project_report_narratives')
  const canManageSections = canAddSections || canEditSections
  const [managerOpen, setManagerOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await Promise.all([reloadSections(), reloadContent()])
    } finally {
      setRefreshing(false)
    }
  }
  const [conflictOpen, setConflictOpen] = useState(false)

  const sections = hasProject
    ? [...records].filter((r) => r.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : []

  async function handleSave(contentRow, sectionLabel, text) {
    if (!contentRow) {
      await createContent({ project_id: project.id, report_id: report.id, narrative_label: sectionLabel, content: text })
      return
    }
    try {
      await updateContent(
        contentRow.id,
        { content: text },
        { version_token: contentRow.version_token, require_fww_lock: true },
      )
    } catch (err) {
      if (err?.response?.status === 409) setConflictOpen(true)
      throw err
    }
  }

  return (
    <Box>
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <NarrativeContextPanel project={project} report={report} equipment={equipment} />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          <Group justify="flex-end" gap={8} mb={12}>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={12} />}
              onClick={() => void handleRefresh()}
              loading={refreshing}
            >
              Refresh
            </Button>
            {canManageSections && (
              <Button
                size="xs"
                variant="default"
                leftSection={<IconSettings size={12} />}
                onClick={() => setManagerOpen(true)}
                disabled={!hasProject}
              >
                Manage sections
              </Button>
            )}
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
                ? contentRows.find((c) => c.report_id === report.id && c.narrative_label === s.narrative_label)
                : null
              return (
                <NarrativeSectionCard
                  key={s.id}
                  label={s.narrative_label}
                  contentRow={contentRow}
                  disabled={!hasReport}
                  onSave={(text) => handleSave(contentRow, s.narrative_label, text)}
                />
              )
            })}
          </Stack>
        </Grid.Col>
      </Grid>

      <SectionsManagerDialog
        opened={managerOpen}
        onClose={() => setManagerOpen(false)}
        project={project}
        records={records}
        create={create}
        update={update}
        remove={remove}
      />

      <Modal opened={conflictOpen} onClose={() => setConflictOpen(false)} title={<Text fw={700} size="sm">Update conflict</Text>} size="sm">
        <Text size="sm" mb={16}>
          Someone else already saved changes to this section. Please refresh the page to see the latest content before saving again.
        </Text>
        <Group justify="flex-end">
          <Button size="xs" onClick={() => setConflictOpen(false)} style={{ background: "#0F2744", border: "none" }}>OK</Button>
        </Group>
      </Modal>
    </Box>
  )
}

function NarrativeSectionCard({ label, contentRow, disabled, onSave }) {
  const [draft, setDraft] = useState(contentRow?.content ?? '')
  const [saveState, setSaveState] = useState('idle')
  const [syncedRowId, setSyncedRowId] = useState(contentRow?.id)
  const timerRef = useRef(null)
  const draftRef = useRef(draft)
  const onSaveRef = useRef(onSave)

  useEffect(() => {
    draftRef.current = draft
  })
  useEffect(() => {
    onSaveRef.current = onSave
  })

  if (contentRow?.id !== syncedRowId && saveState !== 'pending' && saveState !== 'saving') {
    setSyncedRowId(contentRow?.id)
    setDraft(contentRow?.content ?? '')
  }

  const flushSave = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if ((contentRow?.content ?? '') === draftRef.current) return
    setSaveState('saving')
    try {
      await onSaveRef.current(draftRef.current)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }
  const flushSaveRef = useRef(flushSave)
  useEffect(() => {
    flushSaveRef.current = flushSave
  })

  useEffect(
    () => () => {
      void flushSaveRef.current()
    },
    [],
  )

  function handleChange(next) {
    setDraft(next)
    setSaveState('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void flushSaveRef.current()
    }, DEBOUNCE_MS)
  }

  async function handleBlur() {
    await flushSave()
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
        onBlur={() => void handleBlur()}
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
  const { confirm, modal: confirmModal } = useConfirmDialog()
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
    if (!(await confirm(`Remove the "${row.narrative_label}" section?`))) return
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
        <Button size="xs" onClick={addSection} disabled={!newLabel.trim()} style={{ background: "#0F2744", border: "none" }}>Add</Button>
      </Group>
      <Group justify="flex-end" mt={16}>
        <Button size="xs" onClick={onClose} style={{ background: "#0F2744", border: "none" }}>Done</Button>
      </Group>

      {confirmModal}
    </Modal>
  )
}
