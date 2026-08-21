import { Box, Text, Textarea, Stack, Group, Button, Modal, TextInput, Switch } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { IconSettings, IconTrash } from '@tabler/icons-react'
import { useDomainData } from '../../../hooks/useDomainData'
import { useAppConfig } from '../../../contexts/appConfigContext'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'

const DEBOUNCE_MS = 1500
const LOCK_STALE_MINUTES = 10
// Local-only prototype endpoint -- see jfb-narrative-lock-ws/README.md. Not
// wired into Portal_Independent_Backend yet; hardcoded for local testing.
const NARRATIVE_WS_URL = 'ws://localhost:8091/domains/jfb_report_narratives/socket'

// The section LIST (label/order/active) is jfb_project_report_narratives --
// one row per section, per project. The TEXT below is jfb_report_narratives --
// one row per (report, section), joined to its section by narrative_label
// (not a real FK -- there's no stable section_key in this app, so renaming a
// section in "Manage sections" orphans any content already written under the
// old label). Content changes come from the jfb-narrative-lock-ws socket,
// seeded from the one-shot domain fetch until the socket's first snapshot
// arrives. Locks are NOT a domain field -- they live entirely in that
// socket server's memory, keyed by narrative_label, and are granted/released
// by exchanging messages with it rather than writing to jfb_report_narratives.
// See NARRATIVE_LOCKING_PLAN_WEBSOCKET.md and jfb-narrative-lock-ws/README.md.
export default function NarrativesTab({ project, report }) {
  const hasProject = !!project?.id
  const hasReport = !!report?.id
  const { config } = useAppConfig()
  const myUserId = config?.user?.id

  const { records, loading, error, create, update, remove } = useDomainData({
    domain: 'jfb_project_report_narratives',
    system: 'core',
    projectId: project?.id,
  })
  const { records: initialContentRows, create: createContent, update: updateContent } = useDomainData({
    domain: 'jfb_report_narratives',
    system: 'core',
    projectId: project?.id,
  })
  const [managerOpen, setManagerOpen] = useState(false)

  const [liveContentRows, setLiveContentRows] = useState(initialContentRows)
  // narrative_label -> { locked_by, locked_at }. Absent key = unlocked.
  const [locks, setLocks] = useState({})
  const gotSnapshotRef = useRef(false)
  const wsRef = useRef(null)
  const pendingAcquiresRef = useRef(new Map())

  // Once the socket has delivered its own snapshot, stop overwriting live
  // state with the polled useDomainData fetch -- from then on the socket is
  // the source of truth for this report's rows.
  useEffect(() => {
    if (!gotSnapshotRef.current) setLiveContentRows(initialContentRows)
  }, [initialContentRows])

  useEffect(() => {
    if (!hasReport || !myUserId) return
    gotSnapshotRef.current = false
    let stopped = false
    let ws = null
    let reconnectTimer = null
    let backoffMs = 1000

    function connect() {
      if (stopped) return
      ws = new WebSocket(`${NARRATIVE_WS_URL}?report_id=${report.id}&user_id=${myUserId}`)
      wsRef.current = ws
      ws.onopen = () => {
        backoffMs = 1000
      }
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'snapshot') {
          gotSnapshotRef.current = true
          setLiveContentRows(msg.rows)
        } else if (msg.type === 'update') {
          gotSnapshotRef.current = true
          setLiveContentRows((prev) => {
            const idx = prev.findIndex((r) => r.id === msg.row.id)
            if (idx === -1) return [...prev, msg.row]
            const next = [...prev]
            next[idx] = msg.row
            return next
          })
        } else if (msg.type === 'delete') {
          setLiveContentRows((prev) => prev.filter((r) => r.id !== msg.id))
        } else if (msg.type === 'lock_snapshot') {
          setLocks(msg.locks)
        } else if (msg.type === 'lock') {
          setLocks((prev) => ({ ...prev, [msg.narrative_label]: { locked_by: msg.locked_by, locked_at: msg.locked_at } }))
        } else if (msg.type === 'unlock') {
          setLocks((prev) => {
            if (!(msg.narrative_label in prev)) return prev
            const next = { ...prev }
            delete next[msg.narrative_label]
            return next
          })
        } else if (msg.type === 'acquire_result') {
          const pending = pendingAcquiresRef.current.get(msg.narrative_label)
          if (pending) {
            clearTimeout(pending.timeoutId)
            pendingAcquiresRef.current.delete(msg.narrative_label)
            pending.resolve(msg.granted)
          }
          if (msg.granted) {
            setLocks((prev) => ({ ...prev, [msg.narrative_label]: { locked_by: msg.locked_by, locked_at: msg.locked_at } }))
          }
        }
      }
      ws.onclose = () => {
        if (stopped) return
        reconnectTimer = setTimeout(connect, backoffMs)
        backoffMs = Math.min(backoffMs * 2, 30000)
      }
      ws.onerror = () => ws.close()
    }
    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current = null
      ws?.close()
    }
  }, [hasReport, report?.id, myUserId])

  const sections = hasProject
    ? [...records].filter((r) => r.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : []

  // Requests the lock over the socket and resolves once the server replies
  // -- granted if the section is unlocked or already held by this same
  // user_id. No domain write happens here at all; see the file-level comment.
  function acquireLock(label) {
    return new Promise((resolve) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        resolve(false)
        return
      }
      const existingPending = pendingAcquiresRef.current.get(label)
      if (existingPending) clearTimeout(existingPending.timeoutId)
      const timeoutId = setTimeout(() => {
        pendingAcquiresRef.current.delete(label)
        resolve(false)
      }, 5000)
      pendingAcquiresRef.current.set(label, { resolve, timeoutId })
      ws.send(JSON.stringify({ type: 'acquire', narrative_label: label }))
    })
  }

  function releaseLock(label, force = false) {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'release', narrative_label: label, force }))
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
        {sections.map((s) => {
          const contentRow = hasReport
            ? liveContentRows.find((c) => c.report_id === report.id && c.narrative_label === s.narrative_label)
            : null
          return (
            <NarrativeSectionCard
              key={s.id}
              label={s.narrative_label}
              contentRow={contentRow}
              lockInfo={locks[s.narrative_label]}
              disabled={!hasReport}
              myUserId={myUserId}
              onSave={(text) =>
                contentRow
                  ? updateContent(contentRow.id, { content: text })
                  : createContent({ project_id: project.id, report_id: report.id, narrative_label: s.narrative_label, content: text })
              }
              onAcquireLock={() => acquireLock(s.narrative_label)}
              onReleaseLock={() => releaseLock(s.narrative_label)}
              onForceReleaseLock={() => releaseLock(s.narrative_label, true)}
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

function NarrativeSectionCard({ label, contentRow, lockInfo, disabled, myUserId, onSave, onAcquireLock, onReleaseLock, onForceReleaseLock }) {
  const [draft, setDraft] = useState(contentRow?.content ?? '')
  const [saveState, setSaveState] = useState('idle')
  const [syncedRowId, setSyncedRowId] = useState(contentRow?.id)
  // Whether THIS tab/instance believes it currently holds the lock -- state,
  // not a ref, because it feeds lockKind below and refs can't be read during
  // render.
  const [holdingLock, setHoldingLock] = useState(false)
  // Ticks every 30s so the "N min" display advances without needing to call
  // Date.now() directly during render (that's an impure call render must not
  // make -- see react-hooks/purity).
  const [nowMs, setNowMs] = useState(() => Date.now())
  const timerRef = useRef(null)
  const draftRef = useRef(draft)
  const onSaveRef = useRef(onSave)
  const onReleaseLockRef = useRef(onReleaseLock)

  // Keep "latest value" refs in sync after every render (not during it) --
  // same pattern already used elsewhere in this app (see PhotoSlot.jsx).
  useEffect(() => {
    draftRef.current = draft
  })
  useEffect(() => {
    onSaveRef.current = onSave
  })
  useEffect(() => {
    onReleaseLockRef.current = onReleaseLock
  })
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const isLockedByOther = !!lockInfo && lockInfo.locked_by !== myUserId
  const isMine = holdingLock || (!!lockInfo && lockInfo.locked_by === myUserId)
  const lockKind = isLockedByOther ? 'other' : isMine ? 'me' : 'available'
  const minutesAgo = lockInfo?.locked_at
    ? Math.max(0, Math.floor((nowMs - Date.parse(lockInfo.locked_at)) / 60000))
    : null

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

  // Flush any pending save and release the lock (if held) on unmount --
  // switching report day/tab away shouldn't leave text unsaved or a lock
  // stuck. Reads holdingLockRef (kept in sync below) rather than the
  // holdingLock state, since an unmounting component can't safely call
  // setHoldingLock.
  const holdingLockRef = useRef(holdingLock)
  useEffect(() => {
    holdingLockRef.current = holdingLock
  })
  useEffect(
    () => () => {
      void flushSaveRef.current().then(() => {
        if (holdingLockRef.current) {
          void onReleaseLockRef.current()
        }
      })
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

  async function handleFocus() {
    if (disabled || lockKind === 'other') return
    const acquired = await onAcquireLock()
    if (!acquired) return
    setHoldingLock(true)
  }

  async function handleBlur() {
    await flushSave()
    if (holdingLockRef.current) {
      setHoldingLock(false)
      await onReleaseLock()
    }
  }

  return (
    <Box
      p={16}
      style={{
        border: `1px solid ${lockKind === 'other' ? 'var(--mantine-color-orange-4)' : lockKind === 'me' ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-gray-3)'}`,
        borderRadius: 8,
        background: lockKind === 'other' ? 'var(--mantine-color-orange-0)' : '#fff',
      }}
    >
      <Group justify="space-between" mb={8}>
        <Text size="sm" fw={600}>{label}</Text>
        <Group gap={8}>
          {lockKind === 'other' && (
            <Text size="10px" fw={600} c="orange.8">
              {shortUserLabel(lockInfo.locked_by)} editing{minutesAgo != null ? ` · ${minutesAgo} min` : ''}
            </Text>
          )}
          {lockKind === 'me' && <Text size="10px" fw={600} c="blue.7">You are editing</Text>}
          {lockKind === 'other' && minutesAgo != null && minutesAgo >= LOCK_STALE_MINUTES && (
            <Text
              size="10px"
              fw={600}
              c="red.7"
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => onForceReleaseLock()}
            >
              Force unlock
            </Text>
          )}
          <SaveIndicator state={saveState} />
        </Group>
      </Group>
      <Textarea
        autosize
        minRows={2}
        value={draft}
        disabled={disabled || lockKind === 'other'}
        onFocus={handleFocus}
        onBlur={() => void handleBlur()}
        onChange={(e) => handleChange(e.currentTarget.value)}
        placeholder={
          disabled
            ? 'Select a report date to write a narrative…'
            : lockKind === 'other'
              ? 'Read-only — another user is editing.'
              : 'Write the narrative for this section…'
        }
      />
    </Box>
  )
}

function shortUserLabel(userId) {
  if (!userId) return 'Someone'
  return `User ${userId.slice(0, 8)}`
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
        <Button size="xs" onClick={addSection} disabled={!newLabel.trim()} style={{ background: "#0F2744", border: "none" }}>Add</Button>
      </Group>
      <Group justify="flex-end" mt={16}>
        <Button size="xs" onClick={onClose} style={{ background: "#0F2744", border: "none" }}>Done</Button>
      </Group>
    </Modal>
  )
}
