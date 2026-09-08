import { useMemo, useState } from 'react'
import { Box, Text, Table, Stack, Group, Button, Textarea, TextInput, Image, Alert } from '@mantine/core'
import { useWaterMonitoringConfig } from '../../../hooks/useWaterMonitoringConfig'
import { useWaterQualityReadings } from '../../../hooks/useWaterQualityReadings'
import { useWaterMonitoringNotes } from '../../../hooks/useWaterMonitoringNotes'
import { useWaterMonitoringNotesForm } from '../../../hooks/useWaterMonitoringNotesForm'
import { buildTurbidityDay } from '../../../lib/waterQuality/data'
import { renderTurbidityChart } from '../../../lib/waterQuality/chart'

// Water Quality tab -- the Daily Turbidity Reporting page. Ported from the
// non-native app's src/components/WaterQualityTab.tsx, fixed-site (HydroVu)
// variant only -- the tidal/WQData LIVE variant (mode toggle, NOAA tide
// table, daily reference NTU) is out of scope for this phase, see
// WATER_AIR_QUALITY_MIGRATION_PLAN.md section 5.
//
// Everything here is read-only except Notes and the monitor coordinates --
// same "one human input on an auto-populated page" shape as the reference
// app. Currently backed by sample data (see the hooks this imports); no
// wiring changes needed here once those hooks switch to useDomainData.

function fmt(v) {
  return v === null || v === undefined ? '—' : v.toFixed(1)
}

export default function WaterQualityTab({ project, report }) {
  const { config, loading: configLoading } = useWaterMonitoringConfig(project?.id)
  const { readings } = useWaterQualityReadings(config, report?.report_date)
  const notesHook = useWaterMonitoringNotes(report?.id)
  const form = useWaterMonitoringNotesForm({
    reportId: report?.id,
    notesRow: notesHook.notes,
    create: notesHook.create,
    update: notesHook.update,
  })

  const [notes, setNotes] = useState(notesHook.notes?.notes ?? '')
  const [locations, setLocations] = useState(config?.locations ?? [])
  const [editingCoords, setEditingCoords] = useState(false)
  const [coordDrafts, setCoordDrafts] = useState({})
  const [savedAt, setSavedAt] = useState(null)

  // Reset local drafts when the viewed report (or its config) changes --
  // adjusting state during render per React's guidance (a useState-tracked
  // "previous value", not a ref -- react-hooks/refs forbids reading/writing
  // ref.current during render), instead of an effect, since this is a
  // derived reset rather than a sync with an external system.
  const [prevReportId, setPrevReportId] = useState(report?.id)
  if (report?.id !== prevReportId) {
    setPrevReportId(report?.id)
    setNotes(notesHook.notes?.notes ?? '')
  }
  const [prevConfig, setPrevConfig] = useState(config)
  if (config !== prevConfig) {
    setPrevConfig(config)
    setLocations(config?.locations ?? [])
  }

  const day = useMemo(
    () => (config ? buildTurbidityDay(config, readings, report?.report_date) : null),
    [config, readings, report?.report_date],
  )

  const chartUrl = useMemo(() => {
    try {
      if (!day || day.populatedCount === 0) return null
      return renderTurbidityChart(day, config.thresholds).dataUrl
    } catch {
      return null
    }
  }, [day, config])

  if (configLoading) return <Text size="sm" c="dimmed">Loading water quality data...</Text>
  if (!config) return <Text size="sm" c="dimmed">No water monitoring configured for this project.</Text>

  function scheduleNotes(v) {
    setNotes(v)
    form.onFieldChange('notes', v || null)
  }
  async function flushNotes() {
    await form.flush()
    setSavedAt(new Date())
  }

  function startEditCoords() {
    setCoordDrafts(Object.fromEntries(locations.map((l) => [l.role, l.display_coords ?? ''])))
    setEditingCoords(true)
  }
  function saveCoords() {
    const next = locations.map((l) => ({ ...l, display_coords: coordDrafts[l.role]?.trim() || null }))
    setLocations(next)
    setEditingCoords(false)
    setSavedAt(new Date())
    // SAMPLE DATA: not persisted to jfb_water_monitoring_config yet -- once
    // that domain is live, call update(config.id, { locations: next }) here.
  }

  return (
    <Stack gap="md">
      {/* Status band. */}
      <Box p="md" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
        <Group justify="space-between" wrap="wrap">
          <Box>
            <Text size="xs" tt="uppercase" c="dimmed">Avg Difference -- Background vs Compliance</Text>
            <Text size="xl" fw={700} c="#0F2744">
              {fmt(day?.avgDelta)} <Text span size="sm" fw={400} c="dimmed">NTU</Text>
            </Text>
            <Text size="xs" c="dimmed">*Positive = above background * Negative = below background</Text>
          </Box>
          <Box ta="right">
            <Text size="sm" c="dimmed">
              {day?.populatedCount ?? 0} of {day?.slots.length ?? 0} intervals reported * pulled
              automatically from HydroVu
            </Text>
            {savedAt && <Text size="xs" c="dimmed">Notes saved {savedAt.toLocaleTimeString()}</Text>}
          </Box>
        </Group>
      </Box>

      {day?.populatedCount === 0 && (
        <Alert color="yellow" variant="light">
          No readings pulled for this date yet. The hourly HydroVu pull fills this in
          automatically -- check back after the next run.
        </Alert>
      )}

      {chartUrl && (
        <Box p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
          <Image src={chartUrl} alt="Daily turbidity chart" fit="contain" />
        </Box>
      )}

      <Group align="flex-start" grow wrap="wrap">
        {/* Readings table. */}
        <Box style={{ flex: '3 1 480px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6, overflow: 'hidden' }}>
          <Box style={{ maxHeight: 480, overflowY: 'auto' }}>
            <Table withTableBorder={false} verticalSpacing={4} fz="sm" stickyHeader>
              <Table.Thead bg="gray.0">
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th ta="right">Background NTUs</Table.Th>
                  <Table.Th ta="right">Early Warning NTUs</Table.Th>
                  <Table.Th ta="right">Compliance NTUs</Table.Th>
                  <Table.Th ta="right">Background vs. Compliance</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {day?.slots.map((s) => (
                  <Table.Tr key={s.utcISO}>
                    <Table.Td>{s.timeLabel}</Table.Td>
                    <Table.Td ta="right">{fmt(s.background)}</Table.Td>
                    <Table.Td ta="right">{fmt(s.earlyWarning)}</Table.Td>
                    <Table.Td ta="right">{fmt(s.compliance)}</Table.Td>
                    <Table.Td ta="right">{fmt(s.delta)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        </Box>

        {/* Right column: coordinates, notes, thresholds. */}
        <Stack style={{ flex: '2 1 320px' }} gap="md">
          <Box p="md" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
            <Group justify="space-between" mb={6}>
              <Text size="sm" fw={600}>Monitor Coordinates (X,Y)</Text>
              {!editingCoords && (
                <Button variant="subtle" size="compact-xs" onClick={startEditCoords}>Edit</Button>
              )}
            </Group>
            {!editingCoords ? (
              <Stack gap={2}>
                {locations.map((l) => (
                  <Text size="sm" key={l.role}>
                    <Text span fw={600}>{l.label} Monitor:</Text> {l.display_coords ?? '—'}
                  </Text>
                ))}
              </Stack>
            ) : (
              <Stack gap={6}>
                {locations.map((l) => (
                  <TextInput
                    key={l.role}
                    label={`${l.label} Monitor`}
                    size="xs"
                    placeholder="X, Y"
                    value={coordDrafts[l.role] ?? ''}
                    onChange={(e) => setCoordDrafts((prev) => ({ ...prev, [l.role]: e.target.value }))}
                  />
                ))}
                <Group gap={6}>
                  <Button size="compact-xs" onClick={saveCoords}>Save</Button>
                  <Button size="compact-xs" variant="default" onClick={() => setEditingCoords(false)}>Cancel</Button>
                </Group>
                <Text size="xs" c="dimmed">New coordinates print on reports generated from now on.</Text>
              </Stack>
            )}
          </Box>

          <Box p="md" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
            <Text size="sm" fw={600} mb={6}>Notes</Text>
            <Textarea
              value={notes}
              onChange={(e) => scheduleNotes(e.target.value)}
              onBlur={() => void flushNotes()}
              minRows={6}
              placeholder="Monitoring narrative for the day -- buoy maintenance, spikes explained, monitor cleaning, etc."
            />
            <Text size="xs" c="dimmed" mt={4}>Prints under the readings table on the report's turbidity page.</Text>
          </Box>

          <Box p="md" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
            <Text size="sm" fw={600} mb={4}>Thresholds</Text>
            <Stack gap={2}>
              {config.thresholds?.early_warning_ntu != null && (
                <Text size="xs" c="dimmed">Early Warning Level: {config.thresholds.early_warning_ntu} NTU</Text>
              )}
              {config.thresholds?.compliance_1hr_ntu != null && (
                <Text size="xs" c="dimmed">Compliance Level (1-HR): {config.thresholds.compliance_1hr_ntu} NTU</Text>
              )}
              {config.thresholds?.background_multiplier != null && (
                <Text size="xs" c="dimmed">Background Multiplier: {config.thresholds.background_multiplier}x</Text>
              )}
            </Stack>
          </Box>
        </Stack>
      </Group>
    </Stack>
  )
}
