import { Box, Text, Stack, Group } from '@mantine/core'
import { useNarrativeContext } from './hooks/useNarrativeContext'
import { usePicklist } from '../../../hooks/usePicklist'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'

function fmtHours(h) {
  return Number(h ?? 0).toFixed(2)
}

function hhmm(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function NarrativeContextPanel({ project, report, equipment = [] }) {
  const { labels: passTypeLabels } = usePicklist('pkl-jfb-pass-type')
  const { byEquipment, loading, error } = useNarrativeContext({
    projectId: project?.id,
    reportId: report?.id,
    reportDate: report?.report_date,
    equipment,
  })

  return (
    <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, background: '#fff' }}>
      <Text fw={700} size="sm">Today&apos;s context</Text>
      <Text size="xs" c="dimmed" mb={12}>Reference while writing narratives. Read-only.</Text>

      {loading && <LoadingSpinner py={16} />}
      {!loading && <SafeError message={error} />}

      {!loading && !error && byEquipment.length === 0 && (
        <Text size="xs" c="dimmed" fs="italic">No equipment configured.</Text>
      )}

      {!loading && !error && byEquipment.length > 0 && (
        <Stack gap="md">
          {byEquipment.map((block) => (
            <EquipmentBlock key={block.equipment.id} block={block} passTypeLabels={passTypeLabels} />
          ))}
        </Stack>
      )}
    </Box>
  )
}

function EquipmentBlock({ block, passTypeLabels }) {
  const { equipment, events, operatingHours, delayHours, cy, sf } = block

  function categoryLabel(e) {
    if (e.is_operational) return passTypeLabels[e.pass_type] ?? e.pass_type ?? 'Operational'
    return e.delay_label ?? '—'
  }

  return (
    <Box pt={8} style={{ borderTop: '1px solid var(--mantine-color-gray-1)' }} className="narrative-context-block">
      <Text size="xs" fw={700}>{equipment.name}</Text>

      <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 10, rowGap: 2, marginTop: 6 }}>
        <Text size="10px" c="dimmed">Op hours</Text>
        <Text size="10px" ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtHours(operatingHours)}</Text>
        <Text size="10px" c="dimmed">Delay hours</Text>
        <Text size="10px" ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtHours(delayHours)}</Text>
        <Text size="10px" c="dimmed">CY</Text>
        <Text size="10px" ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{cy.toFixed(1)}</Text>
        <Text size="10px" c="dimmed">SF</Text>
        <Text size="10px" ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{sf.toFixed(0)}</Text>
      </Box>

      {events.length > 0 ? (
        <Box mt={8}>
          <Text size="10px" c="dimmed" mb={4}>{events.length} event{events.length === 1 ? '' : 's'}</Text>
          <Stack gap={2} style={{ maxHeight: 190, overflowY: 'auto' }}>
            {events.map((e) => (
              <Group key={e.event_id} gap={6} wrap="nowrap">
                <Text size="10px" c="dimmed" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{hhmm(e.start_date_time)}</Text>
                <Text size="10px" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {categoryLabel(e)}{e.area_label ? ` · ${e.area_label}` : ''}
                </Text>
                <Text size="10px" c="dimmed" ml="auto" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {Number(e.duration_hours ?? 0).toFixed(2)}h
                </Text>
              </Group>
            ))}
          </Stack>
        </Box>
      ) : (
        <Text size="10px" c="dimmed" fs="italic" mt={6}>No events synced.</Text>
      )}
    </Box>
  )
}
