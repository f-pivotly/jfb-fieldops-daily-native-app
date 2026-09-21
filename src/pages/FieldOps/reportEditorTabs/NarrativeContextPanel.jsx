import { useState } from 'react'
import { Box, Text, Stack, Group, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { useNarrativeContext } from './hooks/useNarrativeContext'

const AUTO_GAP_CATEGORY = 'STARTUP/SHUTDOWN'
const LABEL_COLOR = '#374151'
const MUTED_COLOR = '#6B7280'
const AUTO_GAP_COLOR = '#9CA3AF'

function isAutoGap(e) {
  return e.category === AUTO_GAP_CATEGORY
}

function fmtHours(h) {
  return Number(h ?? 0).toFixed(2)
}

function hhmm(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function NarrativeContextPanel({ project, report, equipment = [] }) {
  const { byEquipment, loading, error } = useNarrativeContext({
    projectId: project?.id,
    reportId: report?.id,
    reportDate: report?.report_date,
    equipment,
  })

  return (
    <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, background: '#fff' }}>
      <Text fw={700} size="sm">Today&apos;s context</Text>
      <Text size="11px" c={MUTED_COLOR} mb={16}>Reference while writing narratives. Read-only.</Text>

      {error && <Text size="xs" c="#B91C1C">{error}</Text>}
      {loading && !error && <Text size="xs" c={MUTED_COLOR}>Loading…</Text>}

      {!loading && !error && byEquipment.length === 0 && (
        <Text size="xs" c={MUTED_COLOR} fs="italic">No equipment configured.</Text>
      )}

      {!loading && !error && byEquipment.length > 0 && (
        <Stack gap={16}>
          {byEquipment.map((block, index) => (
            <EquipmentBlock key={block.equipment.id} block={block} first={index === 0} />
          ))}
        </Stack>
      )}
    </Box>
  )
}

function EquipmentBlock({ block, first }) {
  const { equipment, events, operatingHours, delayHours, cy, sf } = block
  const [eventsOpen, setEventsOpen] = useState(true)
  const numberStyle = { fontVariantNumeric: 'tabular-nums' }

  return (
    <Box pt={first ? 0 : 12} style={first ? undefined : { borderTop: '1px solid var(--mantine-color-gray-1)' }}>
      <Text size="xs" fw={600}>{equipment.name}</Text>

      <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 4, marginTop: 6 }}>
        <Text size="11px" c={MUTED_COLOR}>Op hours</Text>
        <Text size="11px" c={LABEL_COLOR} ta="right" style={numberStyle}>{fmtHours(operatingHours)}</Text>
        <Text size="11px" c={MUTED_COLOR}>Delay hours</Text>
        <Text size="11px" c={LABEL_COLOR} ta="right" style={numberStyle}>{fmtHours(delayHours)}</Text>
        <Text size="11px" c={MUTED_COLOR}>CY</Text>
        <Text size="11px" c={LABEL_COLOR} ta="right" style={numberStyle}>{cy.toFixed(1)}</Text>
        <Text size="11px" c={MUTED_COLOR}>SF</Text>
        <Text size="11px" c={LABEL_COLOR} ta="right" style={numberStyle}>{sf.toFixed(0)}</Text>
      </Box>

      {events.length > 0 ? (
        <Box mt={8}>
          <UnstyledButton onClick={() => setEventsOpen((open) => !open)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {eventsOpen ? <IconChevronDown size={10} color={MUTED_COLOR} /> : <IconChevronRight size={10} color={MUTED_COLOR} />}
            <Text size="11px" c={MUTED_COLOR}>{events.length} event{events.length === 1 ? '' : 's'}</Text>
          </UnstyledButton>
          {eventsOpen && (
            <Stack gap={2} mt={4} pr={4} style={{ maxHeight: 192, overflowY: 'auto' }}>
              {events.map((e) => {
                const autoGap = isAutoGap(e)
                const fs = autoGap ? 'italic' : undefined
                return (
                  <Group key={e.event_id} gap={6} wrap="nowrap" align="baseline">
                    <Text size="11px" c={MUTED_COLOR} fs={fs} style={{ flexShrink: 0, ...numberStyle }}>{hhmm(e.start_date_time)}</Text>
                    <Text size="11px" c={autoGap ? AUTO_GAP_COLOR : LABEL_COLOR} fs={fs} truncate="end">{e.category ?? '—'}</Text>
                    {e.area_label && (
                      <Text size="11px" c={MUTED_COLOR} fs={fs} truncate="end">· {e.area_label}</Text>
                    )}
                    <Text size="11px" c={MUTED_COLOR} fs={fs} ml="auto" style={{ flexShrink: 0, ...numberStyle }}>
                      {Number(e.duration_hours ?? 0).toFixed(2)}h
                    </Text>
                  </Group>
                )
              })}
            </Stack>
          )}
        </Box>
      ) : (
        <Text size="11px" c={AUTO_GAP_COLOR} fs="italic" mt={4}>No events synced.</Text>
      )}
    </Box>
  )
}
