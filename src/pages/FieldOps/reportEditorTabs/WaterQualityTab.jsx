import { useEffect, useMemo, useState } from 'react'
import { Box, Text, Table, Stack, Group, Button, Badge, Textarea, TextInput, Image, Alert, FileButton } from '@mantine/core'
import SafeError from '../../../components/SafeError'
import { useWaterMonitoringConfig } from '../../../hooks/monitoring/useWaterMonitoringConfig'
import { useWaterQualityReadings } from '../../../hooks/monitoring/useWaterQualityReadings'
import { useWaterMonitoringNotes } from '../../../hooks/monitoring/useWaterMonitoringNotes'
import { useWaterMonitoringNotesForm } from '../../../hooks/monitoring/useWaterMonitoringNotesForm'
import { useConfirmDialog } from '../../../hooks/ui/useConfirmDialog'
import { isDirectImageUrl } from '../../../lib/imageSource'
import { useAttachmentField } from '../../../hooks/ui/useAttachmentField'
import { buildTurbidityDay, buildTidalTurbidityDay, isTidalConfig, tidalLimits } from '../../../lib/waterQuality/data'
import { renderTurbidityChart, renderTidalTurbidityChart } from '../../../lib/waterQuality/chart'
import {
  fetchTidePredictions,
  fetchTideHiLo,
  PENOBSCOT_TIDE_STATION,
  PENOBSCOT_TIDE_STATION_NAME,
} from '../../../lib/waterQuality/noaaTide'

const SLOT_PAGE = 50

const MAX_AERIAL_BYTES = 10 * 1024 * 1024

const BOX = { border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }

function fmt(v) {
  return v === null || v === undefined ? '—' : v.toFixed(1)
}

function fmtCond(v) {
  return v === null || v === undefined ? '—' : v.toLocaleString('en-US')
}

function fmt2(v) {
  return v === null || v === undefined ? '—' : v.toFixed(2)
}

function useTide(enabled, dateISO) {
  const key = enabled && dateISO ? dateISO : null
  const [tide, setTide] = useState({ key: null, tideByMs: undefined, hiLo: [] })
  useEffect(() => {
    if (!key) return
    let cancelled = false
    Promise.all([fetchTidePredictions(key), fetchTideHiLo(key)]).then(([tideByMs, hiLo]) => {
      if (!cancelled) setTide({ key, tideByMs, hiLo })
    })
    return () => { cancelled = true }
  }, [key])
  if (!key || tide.key !== key) return { tideByMs: undefined, hiLo: [], loading: !!key }
  return { tideByMs: tide.tideByMs, hiLo: tide.hiLo, loading: false }
}

export default function WaterQualityTab({ project, report }) {
  const { config, loading: configLoading, error: configError, update: updateConfig } = useWaterMonitoringConfig(project?.id)
  const { readings, loading: readingsLoading, error: readingsError } = useWaterQualityReadings(config, report?.report_date)
  const notesHook = useWaterMonitoringNotes(report?.id)
  const form = useWaterMonitoringNotesForm({
    projectId: project?.id,
    reportId: report?.id,
    notesRow: notesHook.notes,
    create: notesHook.create,
    update: notesHook.update,
  })
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const isTidal = isTidalConfig(config)
  const { tideByMs, hiLo, loading: tideLoading } = useTide(isTidal, report?.report_date)

  const [notes, setNotes] = useState(notesHook.notes?.notes ?? '')
  const [refInput, setRefInput] = useState(notesHook.notes?.reference_ntu != null ? String(notesHook.notes.reference_ntu) : '')
  const [referenceNtu, setReferenceNtu] = useState(notesHook.notes?.reference_ntu ?? null)
  const [mode, setMode] = useState(config?.mode === 'compliance' ? 'compliance' : 'background')
  const [modeSaving, setModeSaving] = useState(false)
  const [locations, setLocations] = useState(config?.locations ?? [])
  const [editingCoords, setEditingCoords] = useState(false)
  const [coordDrafts, setCoordDrafts] = useState({})
  const [coordSaving, setCoordSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const aerialIsUrl = isDirectImageUrl(config?.aerial_path)
  const aerial = useAttachmentField({
    existingFileId: aerialIsUrl ? null : config?.aerial_path,
    ensureRecordId: config?.id,
    updateRecord: updateConfig,
    domain: 'jfb_water_monitoring_config',
    column: 'aerial_path',
    maxBytes: MAX_AERIAL_BYTES,
    onSaved: () => setSavedAt(new Date()),
    onError: setSaveError,
  })
  const aerialSrc = aerialIsUrl ? config.aerial_path : aerial.url
  const loadError = configError || readingsError || notesHook.error
  const displayError = saveError || loadError

  const notesKey = `${report?.id ?? 'none'}|${notesHook.notes?.id ?? 'none'}`
  const [prevNotesKey, setPrevNotesKey] = useState(notesKey)
  if (notesKey !== prevNotesKey) {
    setPrevNotesKey(notesKey)
    setNotes(notesHook.notes?.notes ?? '')
    const savedRef = notesHook.notes?.reference_ntu ?? null
    setReferenceNtu(savedRef)
    setRefInput(savedRef != null ? String(savedRef) : '')
  }
  const [prevConfig, setPrevConfig] = useState(config)
  if (config !== prevConfig) {
    setPrevConfig(config)
    setLocations(config?.locations ?? [])
    setMode(config?.mode === 'compliance' ? 'compliance' : 'background')
  }

  const day = useMemo(
    () => (config && !isTidal ? buildTurbidityDay(config, readings, report?.report_date) : null),
    [config, isTidal, readings, report?.report_date],
  )

  const tidalDay = useMemo(() => {
    if (!config || !isTidal) return null
    return buildTidalTurbidityDay(
      config,
      readings,
      report?.report_date,
      tideByMs,
      mode === 'compliance'
        ? {
            compliance: true,
            thresholds: config.thresholds,
            tideOffsetMin: config.tide_offset_minutes ?? 0,
            referenceNtu,
          }
        : undefined,
    )
  }, [config, isTidal, readings, report?.report_date, tideByMs, mode, referenceNtu])

  const activeDay = isTidal ? tidalDay : day

  const chartUrl = useMemo(() => {
    try {
      if (isTidal) {
        if (!tidalDay || tidalDay.populatedCount === 0) return null
        return renderTidalTurbidityChart(tidalDay, { compliance: mode === 'compliance' }).dataUrl
      }
      if (!day || day.populatedCount === 0) return null
      return renderTurbidityChart(day, config.thresholds).dataUrl
    } catch {
      return null
    }
  }, [isTidal, tidalDay, day, mode, config])

  const loadKey = `${project?.id ?? ''}|${report?.id ?? ''}|${report?.report_date ?? ''}`
  const stillLoading = configLoading || readingsLoading || (isTidal && tideLoading) || (!!report?.id && notesHook.loading)
  const [readyKey, setReadyKey] = useState(null)
  if (readyKey !== loadKey && !stillLoading) setReadyKey(loadKey)
  const showLoading = readyKey !== loadKey && stillLoading

  const allSlots = activeDay?.slots ?? []
  const [shown, setShown] = useState(SLOT_PAGE)
  const visibleSlots = allSlots.slice(0, shown)
  const remaining = Math.max(0, allSlots.length - visibleSlots.length)
  const slotKey = `${report?.id ?? ''}|${allSlots.length}`
  const [prevSlotKey, setPrevSlotKey] = useState(slotKey)
  if (slotKey !== prevSlotKey) {
    setPrevSlotKey(slotKey)
    setShown(SLOT_PAGE)
  }

  if (showLoading) return <Text size="sm" c="dimmed">Loading water quality data...</Text>
  if (!config) return <Text size="sm" c="dimmed">No water monitoring configured for this project.</Text>

  const providerLabel = isTidal ? 'WQData LIVE' : 'HydroVu'
  const isCompliance = isTidal && mode === 'compliance'
  const { ewDelta, compDelta, responseActionNtu, notToExceedNtu } = tidalLimits(config.thresholds, referenceNtu)
  const exceedanceCount = tidalDay?.slots.filter((s) => s.exceedance).length ?? 0

  function scheduleNotes(v) {
    setNotes(v)
    form.onFieldChange('notes', v || null)
  }
  function scheduleReference(raw) {
    setRefInput(raw)
    const trimmed = String(raw).trim()
    const num = trimmed === '' ? null : Number(trimmed)
    if (trimmed !== '' && !Number.isFinite(num)) return
    setReferenceNtu(num)
    form.onFieldChange('reference_ntu', num)
  }
  async function flushForm() {
    try {
      await form.flush()
      setSavedAt(new Date())
      setSaveError(null)
    } catch (err) {
      setSaveError(err.message || 'Failed to save.')
    }
  }

  async function toggleMode() {
    const next = mode === 'background' ? 'compliance' : 'background'
    if (next === 'compliance') {
      const ok = await confirm(
        `Switch to Compliance Monitoring? This shows the Response Action (+${ewDelta ?? '—'}) and Not-to-Exceed (+${compDelta ?? '—'}) limit lines from the daily reference value and flags exceedances (used once cap placement begins).`,
      )
      if (!ok) return
    }
    setModeSaving(true)
    try {
      await updateConfig(config.id, {
        mode: next,
        compliance_started_at: next === 'compliance' ? new Date().toISOString() : null,
      })
      setMode(next)
      setSaveError(null)
    } catch (err) {
      setSaveError(err.message || 'Failed to switch mode.')
    } finally {
      setModeSaving(false)
    }
  }

  function startEditCoords() {
    setCoordDrafts(Object.fromEntries(locations.map((l) => [l.role, l.display_coords ?? ''])))
    setEditingCoords(true)
  }
  async function saveCoords() {
    const next = locations.map((l) => ({ ...l, display_coords: coordDrafts[l.role]?.trim() || null }))
    setCoordSaving(true)
    try {
      await updateConfig(config.id, { locations: next })
      setLocations(next)
      setEditingCoords(false)
      setSavedAt(new Date())
      setSaveError(null)
    } catch (err) {
      setSaveError(err.message || 'Failed to save coordinates.')
    } finally {
      setCoordSaving(false)
    }
  }

  return (
    <Stack gap="md">
      {confirmModal}
      <SafeError message={displayError} />

      <Box p="md" style={BOX}>
        <Group justify="space-between" wrap="wrap">
          {isTidal ? (
            <Group gap="sm">
              <Badge color={isCompliance ? 'yellow' : 'gray'} variant="light" radius="sm">
                {isCompliance ? 'Compliance Monitoring' : 'Background Monitoring'}
              </Badge>
              <Button size="compact-xs" variant="default" onClick={() => void toggleMode()} loading={modeSaving} disabled={modeSaving}>
                {mode === 'background' ? 'Switch to Compliance' : 'Switch to Background'}
              </Button>
            </Group>
          ) : (
            <Box>
              <Text size="xs" tt="uppercase" c="dimmed">Avg Difference -- Background vs Compliance</Text>
              <Text size="xl" fw={700} c="#0F2744">
                {fmt(day?.avgDelta)} <Text span size="sm" fw={400} c="dimmed">NTU</Text>
              </Text>
              <Text size="xs" c="dimmed">*Positive = above background * Negative = below background</Text>
            </Box>
          )}
          <Box ta="right">
            <Text size="sm" c="dimmed">
              {activeDay?.populatedCount ?? 0} of {activeDay?.slots.length ?? 0} {isTidal ? 'hours' : 'intervals'} reported * pulled
              automatically from {providerLabel}
            </Text>
            {savedAt && <Text size="xs" c="dimmed">Notes saved {savedAt.toLocaleTimeString()}</Text>}
          </Box>
        </Group>
      </Box>

      {activeDay?.populatedCount === 0 && (
        <Alert color="yellow" variant="light">
          No readings pulled for this date yet. The hourly {providerLabel} pull fills this in
          automatically -- check back after the next run.
        </Alert>
      )}

      {chartUrl && (
        <Box p="xs" style={BOX}>
          <Image src={chartUrl} alt="Daily turbidity chart" fit="contain" />
        </Box>
      )}

      <Stack gap="md">
        <Box style={{ ...BOX, overflow: 'hidden' }}>
          <Box style={{ maxHeight: 540, overflowY: 'auto' }}>
            <Table withTableBorder={false} verticalSpacing={4} fz="xs" stickyHeader>
              <Table.Thead>
                {isTidal ? (
                  <Table.Tr>
                    <Table.Th>Time</Table.Th>
                    <Table.Th ta="right">Upstream NTU</Table.Th>
                    <Table.Th ta="right">Upstream Cond (uS/cm)</Table.Th>
                    <Table.Th ta="right">Downstream NTU</Table.Th>
                    <Table.Th ta="right">Downstream Cond (uS/cm)</Table.Th>
                    <Table.Th ta="right">Tide (ft)</Table.Th>
                  </Table.Tr>
                ) : (
                  <Table.Tr>
                    <Table.Th>Time</Table.Th>
                    <Table.Th ta="right">Background NTUs</Table.Th>
                    <Table.Th ta="right">Early Warning NTUs</Table.Th>
                    <Table.Th ta="right">Compliance NTUs</Table.Th>
                    <Table.Th ta="right">Background vs. Compliance</Table.Th>
                  </Table.Tr>
                )}
              </Table.Thead>
              <Table.Tbody>
                {isTidal
                  ? visibleSlots.map((s) => (
                      <Table.Tr key={s.utcISO} bg={isCompliance && s.exceedance ? 'red.0' : undefined}>
                        <Table.Td>{s.timeLabel}</Table.Td>
                        <Table.Td ta="right">{fmt(s.upstream)}</Table.Td>
                        <Table.Td ta="right">{fmtCond(s.upstreamCond)}</Table.Td>
                        <Table.Td ta="right">{fmt(s.downstream)}</Table.Td>
                        <Table.Td ta="right">{fmtCond(s.downstreamCond)}</Table.Td>
                        <Table.Td ta="right">{fmt(s.tideFt)}</Table.Td>
                      </Table.Tr>
                    ))
                  : visibleSlots.map((s) => (
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
          {remaining > 0 && (
            <Group justify="center" gap={12} p="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
              <Text size="xs" c="dimmed">Showing {visibleSlots.length} of {allSlots.length}</Text>
              <Button size="xs" variant="default" onClick={() => setShown((n) => n + SLOT_PAGE)}>
                Load {Math.min(SLOT_PAGE, remaining)} more
              </Button>
              {remaining > SLOT_PAGE && (
                <Button size="xs" variant="subtle" onClick={() => setShown(allSlots.length)}>
                  Show all {allSlots.length}
                </Button>
              )}
            </Group>
          )}
        </Box>

        <Stack gap="md">
          {isCompliance && (
            <Box p="md" style={BOX}>
              <Text size="sm" fw={600} mb={6}>Daily Turbidity Reference (NTU)</Text>
              <Group gap="sm" align="center">
                <TextInput
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  size="xs"
                  w={120}
                  value={refInput}
                  onChange={(e) => scheduleReference(e.target.value)}
                  onBlur={() => void flushForm()}
                  placeholder="e.g. 6.31"
                />
                <Text size="xs" c="dimmed">from the engineer each morning</Text>
              </Group>
              <Stack gap={2} mt={8}>
                <Group justify="space-between">
                  <Text size="xs">Response Action Alarm (+{ewDelta ?? '—'})</Text>
                  <Text size="xs" fw={600}>{fmt2(responseActionNtu)} NTU</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs">Not-to-Exceed (+{compDelta ?? '—'})</Text>
                  <Text size="xs" fw={600}>{fmt2(notToExceedNtu)} NTU</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">Exceedances today</Text>
                  <Text size="xs" fw={600} c={exceedanceCount > 0 ? 'red.7' : undefined}>{exceedanceCount}</Text>
                </Group>
              </Stack>
              {referenceNtu == null && (
                <Text size="xs" c="orange.8" mt={4}>Enter today's reference to show the limit lines on the chart.</Text>
              )}
            </Box>
          )}

          <Box p="xs" style={BOX}>
            {aerialSrc ? (
              <Image src={aerialSrc} alt="Aerial site map with monitor locations" fit="contain" />
            ) : (
              <Box style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 6, padding: 24, textAlign: 'center' }}>
                <Text size="xs" c="dimmed" fs="italic">No aerial site map uploaded yet.</Text>
              </Box>
            )}
            <Group justify="space-between" mt={8} wrap="nowrap">
              <FileButton onChange={(f) => f && aerial.upload(f)} accept="image/png,image/jpeg,image/webp" disabled={aerial.uploading}>
                {(props) => {
                  let label = 'Upload aerial image'
                  if (aerial.uploading) label = 'Uploading...'
                  else if (aerialSrc) label = 'Replace aerial image'
                  return (
                    <Button {...props} variant="default" size="compact-xs" loading={aerial.uploading}>
                      {label}
                    </Button>
                  )
                }}
              </FileButton>
              <Text size="10px" c="dimmed">PNG · JPG · WEBP · ≤10 MB</Text>
            </Group>
            <SafeError message={aerial.error} mt={6} />
          </Box>

          <Box p="md" style={BOX}>
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
                    {l.depth_ft != null ? `  ·  Depth: ${l.depth_ft} FT` : ''}
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
                  <Button size="compact-xs" onClick={saveCoords} loading={coordSaving} disabled={coordSaving}>Save</Button>
                  <Button size="compact-xs" variant="default" onClick={() => setEditingCoords(false)} disabled={coordSaving}>Cancel</Button>
                </Group>
                <Text size="xs" c="dimmed">New coordinates print on reports generated from now on.</Text>
              </Stack>
            )}
          </Box>

          {isTidal && hiLo.length > 0 && (
            <Box p="md" style={BOX}>
              <Text size="sm" fw={600} mb={6}>
                Tide Event Table -- NOAA Station {PENOBSCOT_TIDE_STATION} ({PENOBSCOT_TIDE_STATION_NAME}), MLLW
              </Text>
              <Table withTableBorder={false} verticalSpacing={2} fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Time</Table.Th>
                    <Table.Th ta="right">Height (ft)</Table.Th>
                    <Table.Th ta="right">Event</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {hiLo.map((e) => (
                    <Table.Tr key={`${e.timeLabel}|${e.type}`}>
                      <Table.Td>{e.timeLabel}</Table.Td>
                      <Table.Td ta="right">{e.heightFt.toFixed(2)}</Table.Td>
                      <Table.Td ta="right">{e.type}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          )}

          <Box p="md" style={BOX}>
            <Text size="sm" fw={600} mb={6}>Notes</Text>
            <Textarea
              value={notes}
              onChange={(e) => scheduleNotes(e.target.value)}
              onBlur={() => void flushForm()}
              minRows={6}
              placeholder="Monitoring narrative for the day -- buoy maintenance, spikes explained, monitor cleaning, etc."
            />
            <Text size="xs" c="dimmed" mt={4}>Prints under the readings table on the report's turbidity page.</Text>
          </Box>

          <Box p="md" style={BOX}>
            <Text size="sm" fw={600} mb={4}>Thresholds</Text>
            <Stack gap={2}>
              {config.thresholds?.early_warning_ntu != null && (
                <Text size="xs" c="dimmed">Early Warning Level: {config.thresholds.early_warning_ntu} NTU</Text>
              )}
              {config.thresholds?.compliance_4hr_ntu != null && (
                <Text size="xs" c="dimmed">Compliance Level (4-HR): {config.thresholds.compliance_4hr_ntu} NTU</Text>
              )}
              {config.thresholds?.compliance_1hr_ntu != null && (
                <Text size="xs" c="dimmed">Compliance Level (1-HR): {config.thresholds.compliance_1hr_ntu} NTU</Text>
              )}
              {config.thresholds?.background_multiplier != null && (
                <Text size="xs" c="dimmed">Background Multiplier: {config.thresholds.background_multiplier}×</Text>
              )}
              {config.thresholds?.early_warning_delta_ntu != null && (
                <Text size="xs" c="dimmed">Early-Warning Criterion: Background + {config.thresholds.early_warning_delta_ntu} NTU</Text>
              )}
              {config.thresholds?.compliance_delta_ntu != null && (
                <Text size="xs" c="dimmed">Compliance Criterion: Background + {config.thresholds.compliance_delta_ntu} NTU</Text>
              )}
            </Stack>
          </Box>
        </Stack>
      </Stack>
    </Stack>
  )
}
