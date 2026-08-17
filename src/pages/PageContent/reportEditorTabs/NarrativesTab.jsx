import { Box, Text, Textarea, Stack, Group, Button, Modal, TextInput, Switch } from '@mantine/core'
import { useState } from 'react'
import { IconSettings, IconGripVertical, IconTrash, IconLock } from '@tabler/icons-react'
import { SAMPLE_NARRATIVE_SECTIONS } from '../../../data/reportEditorSampleData'

export default function NarrativesTab() {
  const [sections, setSections] = useState(SAMPLE_NARRATIVE_SECTIONS)
  const [focusedKey, setFocusedKey] = useState(null)
  const [previewKey, setPreviewKey] = useState(null)
  const [managerOpen, setManagerOpen] = useState(false)

  function setContent(key, content) {
    setSections((prev) => prev.map((x) => (x.key === key ? { ...x, content } : x)))
  }

  function acceptPrefill(section) {
    setContent(section.key, section.priorDayContent)
    setPreviewKey(null)
  }

  function releaseLock(key) {
    setSections((prev) => prev.map((x) => (x.key === key ? { ...x, lockedByOther: null } : x)))
  }

  const visible = sections.filter((s) => !s.hidden)

  return (
    <Box>
      <Group justify="flex-end" mb={12}>
        <Button size="xs" variant="default" leftSection={<IconSettings size={12} />} onClick={() => setManagerOpen(true)}>
          Manage sections
        </Button>
      </Group>

      <Stack gap="md">
        {visible.map((s) => {
          const lockedByOther = !!s.lockedByOther
          const lockedByMe = focusedKey === s.key
          let borderColor = 'var(--mantine-color-gray-3)'
          if (lockedByOther) borderColor = '#e6cb87'
          else if (lockedByMe) borderColor = '#0F2744'
          return (
            <Box
              key={s.key}
              p={16}
              style={{
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                background: lockedByOther ? '#fbf1dd' : '#fff',
              }}
            >
              <Group justify="space-between" mb={8}>
                <Text size="sm" fw={600}>{s.label}</Text>
                {lockedByOther && (
                  <Group gap={6}>
                    <IconLock size={12} color="#b5740a" />
                    <Text size="10px" c="#7a5206">
                      Locked by {s.lockedByOther.name} · {s.lockedByOther.minutesAgo}m ago
                    </Text>
                    <Text size="10px" fw={700} c="#0F2744" onClick={() => releaseLock(s.key)} style={{ cursor: 'pointer' }}>
                      Release lock
                    </Text>
                  </Group>
                )}
                {!lockedByOther && lockedByMe && (
                  <Text size="10px" c="#0F2744" fw={600}>Editing…</Text>
                )}
              </Group>

              <Textarea
                autosize
                minRows={2}
                readOnly={lockedByOther}
                value={s.content}
                onFocus={() => setFocusedKey(s.key)}
                onBlur={() => setFocusedKey((k) => (k === s.key ? null : k))}
                onChange={(e) => setContent(s.key, e.currentTarget.value)}
              />

              {!s.content && !lockedByOther && previewKey !== s.key && (
                <Text
                  size="xs"
                  mt={6}
                  c="#0F2744"
                  fw={600}
                  onClick={() => setPreviewKey(s.key)}
                  style={{ cursor: 'pointer', display: 'inline-block' }}
                >
                  Use previous day's text
                </Text>
              )}

              {previewKey === s.key && (
                <Box mt={8} p={10} style={{ background: '#f5f6f8', border: '1px solid #e7ecf5', borderRadius: 6 }}>
                  <Text size="10px" c="dimmed" mb={4} tt="uppercase">Previous day's text</Text>
                  <Text size="xs" mb={8}>{s.priorDayContent}</Text>
                  <Group gap={8}>
                    <Button size="xs" onClick={() => acceptPrefill(s)} style={{ background: '#0F2744', border: 'none' }}>Accept and insert</Button>
                    <Button size="xs" variant="default" onClick={() => setPreviewKey(null)}>Cancel</Button>
                  </Group>
                </Box>
              )}
            </Box>
          )
        })}
      </Stack>

      <SectionsManagerDialog opened={managerOpen} onClose={() => setManagerOpen(false)} sections={sections} setSections={setSections} />
    </Box>
  )
}

function SectionsManagerDialog({ opened, onClose, sections, setSections }) {
  const [newLabel, setNewLabel] = useState('')

  function rename(key, label) {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, label } : s)))
  }
  function toggleHidden(key) {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, hidden: !s.hidden } : s)))
  }
  function move(index, dir) {
    setSections((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) {
        return prev
      }
      const next = [...prev]
      next[index] = prev[target]
      next[target] = prev[index]
      return next
    })
  }
  function remove(key) {
    setSections((prev) => prev.filter((s) => s.key !== key))
  }
  function addSection() {
    if (!newLabel.trim()) return
    setSections((prev) => [
      ...prev,
      { key: `sec-${Date.now()}`, label: newLabel.trim(), content: '', hidden: false, priorDayContent: '', lockedByOther: null },
    ])
    setNewLabel('')
  }

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700} size="sm">Manage Narrative Sections</Text>} size="md">
      <Stack gap={8} mb={16}>
        {sections.map((s, i) => (
          <Group key={s.key} gap={8} wrap="nowrap">
            <IconGripVertical size={14} color="#ccc" />
            <TextInput size="xs" value={s.label} onChange={(e) => rename(s.key, e.currentTarget.value)} style={{ flex: 1 }} />
            <Switch size="xs" checked={!s.hidden} onChange={() => toggleHidden(s.key)} label="Visible" />
            <Button size="xs" variant="subtle" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
            <Button size="xs" variant="subtle" onClick={() => move(i, 1)} disabled={i === sections.length - 1}>↓</Button>
            <Box onClick={() => remove(s.key)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex' }}>
              <IconTrash size={13} />
            </Box>
          </Group>
        ))}
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
