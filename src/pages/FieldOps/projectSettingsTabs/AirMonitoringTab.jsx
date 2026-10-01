import { useState } from 'react'
import { Box, Text, Group, Select, TextInput, Textarea, Table, Checkbox, Stack, ActionIcon } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import { useAirMonitoringConfig } from '../../../hooks/monitoring/useAirMonitoringConfig'
import { useLatestReading, useSavedFlash } from '../../../hooks/monitoring/useMonitoringSettings'
import { useConfirmDialog } from '../../../hooks/ui/useConfirmDialog'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'
import { DEFAULT_TIMEZONE, DIGITS, buildThresholds, checkSchedule, scheduleFields, textOf, thresholdDrafts, toHhmm } from '../lib/monitoringForm'
import { MonitoringActions, MonitoringHeader, MonitoringProjectLine, NotSetUp, ScheduleInputs, ThresholdInputs } from './components/MonitoringFormParts'

const DEFAULT_BASE_URL = 'https://sgsusa-ws.i-comesure.com'

const THRESHOLDS = [
  { key: 'alert_offset_mgm3', label: 'Alert level offset (mg/m³)' },
  { key: 'action_offset_mgm3', label: 'Action level offset (mg/m³)' },
  { key: 'early_warning_mgm3', label: 'Early warning (mg/m³)' },
  { key: 'not_to_exceed_mgm3', label: 'Not to exceed (mg/m³)' },
]

const CHARTS = [
  { value: 'llra', label: 'LLRA' },
  { value: 'mbp', label: 'Mineral Building Property' },
]

let rowSeq = 0
const nextUid = () => `station-${++rowSeq}`

function stationRow(station) {
  return {
    uid: nextUid(),
    key: textOf(station?.key),
    label: textOf(station?.label),
    sensor_id: textOf(station?.sensor_id),
    chart: station?.chart === 'mbp' ? 'mbp' : 'llra',
    background: station?.role === 'background',
    extra: station ?? {},
  }
}

function formFrom(config, project) {
  return {
    base_url: config?.base_url || DEFAULT_BASE_URL,
    timezone: config?.timezone || project?.report_timezone || DEFAULT_TIMEZONE,
    window_start: toHhmm(config?.window_start, '06:00'),
    window_end: toHhmm(config?.window_end, '18:00'),
    interval_minutes: config?.interval_minutes ?? 15,
    stations: (Array.isArray(config?.stations) ? config.stations : []).map(stationRow),
    thresholds: thresholdDrafts(THRESHOLDS, config?.thresholds),
    equipment_text: config?.equipment_text ?? '',
    calibration_text: config?.calibration_text ?? '',
    notes_text: config?.notes_text ?? '',
  }
}

function stationKeyFrom(label, taken) {
  const base = label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('_') || 'station'
  let key = base
  let n = 2
  while (taken.has(key)) {
    key = `${base}_${n}`
    n += 1
  }
  taken.add(key)
  return key
}

function buildStations(rows) {
  const taken = new Set(rows.map((r) => r.key).filter(Boolean))
  const sensors = new Set()
  const stations = []
  for (const [i, r] of rows.entries()) {
    const label = r.label.trim()
    const sensorId = r.sensor_id.trim()
    if (!label) return { error: `Station ${i + 1}: enter a label.` }
    if (!DIGITS.test(sensorId)) return { error: `${label}: sensor ID must be digits only.` }
    if (sensors.has(sensorId)) return { error: `Sensor ID ${sensorId} is listed more than once.` }
    sensors.add(sensorId)
    const station = { ...r.extra, key: r.key || stationKeyFrom(label, taken), label, sensor_id: sensorId, chart: r.chart }
    if (r.background) station.role = 'background'
    else delete station.role
    stations.push(station)
  }
  if (!stations.length) return { error: 'Add at least one station.' }
  return { value: stations }
}

function cleanBaseUrl(value) {
  let url = value.trim()
  while (url.endsWith('/')) url = url.slice(0, -1)
  return url
}

export default function AirMonitoringTab({ project }) {
  const { config, loading, error: loadError, creating, updating, deleting, create, update, remove } = useAirMonitoringConfig(project?.id)
  const latest = useLatestReading('jfb_air_quality_readings', project?.id, !!config)
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { savedAt, setSavedAt, error, setError } = useSavedFlash()
  const [setupOpen, setSetupOpen] = useState(false)
  const [form, setForm] = useState(() => formFrom(null, project))
  const [syncedFor, setSyncedFor] = useState(null)

  const syncKey = loading || !project?.id ? null : `${project.id}|${config?.id ?? 'none'}`
  if (syncKey && syncedFor !== syncKey) {
    setSyncedFor(syncKey)
    setForm(formFrom(config, project))
  }

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const setStation = (uid, field, value) =>
    setForm((f) => ({ ...f, stations: f.stations.map((s) => (s.uid === uid ? { ...s, [field]: value } : s)) }))
  const setBackground = (uid, checked) =>
    setForm((f) => ({
      ...f,
      stations: f.stations.map((s) => {
        if (s.uid === uid) return { ...s, background: checked }
        return checked ? { ...s, background: false } : s
      }),
    }))
  const addStation = () => setForm((f) => ({ ...f, stations: [...f.stations, stationRow(null)] }))
  const removeStation = (uid) => setForm((f) => ({ ...f, stations: f.stations.filter((s) => s.uid !== uid) }))

  async function save() {
    setError(null)
    const baseUrl = cleanBaseUrl(form.base_url)
    if (!baseUrl.startsWith('https://') || baseUrl.length <= 8 || /\s/.test(baseUrl)) return setError('Portal URL must start with https://')
    const scheduleError = checkSchedule(form)
    if (scheduleError) return setError(scheduleError)
    const stations = buildStations(form.stations)
    if (stations.error) return setError(stations.error)
    const thresholds = buildThresholds(THRESHOLDS, form.thresholds, config?.thresholds)
    if (thresholds.error) return setError(thresholds.error)
    const record = {
      provider: 'ecomzen',
      base_url: baseUrl,
      ...scheduleFields(form),
      stations: stations.value,
      thresholds: thresholds.value,
      equipment_text: form.equipment_text.trim() || null,
      calibration_text: form.calibration_text.trim() || null,
      notes_text: form.notes_text.trim() || null,
    }
    try {
      if (config?.id) await update(config.id, record)
      else await create({ ...record, project_id: project.id })
      setForm((f) => ({ ...f, stations: f.stations.map((s, i) => ({ ...s, key: stations.value[i].key, extra: stations.value[i] })) }))
      setSetupOpen(false)
      setSavedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save air monitoring.')
    }
  }

  async function removeSetup() {
    if (!config?.id) return
    if (!(await confirm('Remove air monitoring from this project? New readings stop being pulled and the Air Quality report tab shows "not configured". Readings already pulled are kept.'))) return
    setError(null)
    try {
      await remove(config.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove air monitoring.')
    }
  }

  if (!project?.id) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Select a project to manage its air monitoring.</Text>
  }

  const showForm = !!config || setupOpen

  return (
    <Box>
      {confirmModal}
      <MonitoringHeader title="Air Quality Monitoring" savedAt={savedAt}>
        PM10 readings are pulled automatically from Ecomzen (SGS Galson SmartSense) for the sensor IDs below and shown on the
        report's Air Quality tab. The sensors must be in JFB's Ecomzen account.
      </MonitoringHeader>
      <MonitoringProjectLine project={project} />

      {loading && <LoadingSpinner py={16} />}
      {!loading && <SafeError message={loadError} mb={8} />}

      {!loading && !loadError && !showForm && (
        <NotSetUp label="Set up air monitoring" onStart={() => setSetupOpen(true)} />
      )}

      {!loading && !loadError && showForm && (
        <Stack gap="sm">
          <TextInput
            label="Ecomzen portal URL" size="xs" w={320}
            value={form.base_url}
            onChange={(e) => { const v = e.currentTarget.value; setField('base_url', v) }}
          />
          <ScheduleInputs form={form} setField={setField} />

          <Box>
            <Group justify="space-between" mb={4}>
              <Text fw={600} size="xs">Stations</Text>
              <Box onClick={addStation} style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#1c4e9e' }}>+ Add station</Box>
            </Group>
            {form.stations.length === 0 ? (
              <Text size="xs" c="dimmed" fs="italic">No stations yet.</Text>
            ) : (
              <Table withTableBorder verticalSpacing={4} fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Label</Table.Th>
                    <Table.Th>Sensor ID</Table.Th>
                    <Table.Th>Chart</Table.Th>
                    <Table.Th>Background</Table.Th>
                    <Table.Th style={{ width: 40 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {form.stations.map((s) => (
                    <Table.Tr key={s.uid}>
                      <Table.Td>
                        <TextInput size="xs" placeholder="e.g. Background (NW Beach)" value={s.label} onChange={(e) => { const v = e.currentTarget.value; setStation(s.uid, 'label', v) }} />
                      </Table.Td>
                      <Table.Td>
                        <TextInput size="xs" w={110} value={s.sensor_id} onChange={(e) => { const v = e.currentTarget.value; setStation(s.uid, 'sensor_id', v) }} />
                      </Table.Td>
                      <Table.Td>
                        <Select size="xs" w={200} allowDeselect={false} data={CHARTS} value={s.chart} onChange={(v) => setStation(s.uid, 'chart', v ?? 'llra')} />
                      </Table.Td>
                      <Table.Td>
                        <Checkbox size="xs" checked={s.background} onChange={(e) => { const v = e.currentTarget.checked; setBackground(s.uid, v) }} />
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon size="sm" variant="subtle" color="red" onClick={() => removeStation(s.uid)} title="Remove station">
                          <IconTrash size={13} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Box>

          <Box>
            <Text fw={600} size="xs" mb={4}>Limit lines</Text>
            <ThresholdInputs
              fields={THRESHOLDS}
              drafts={form.thresholds}
              onChange={(key, v) => setForm((f) => ({ ...f, thresholds: { ...f.thresholds, [key]: v } }))}
            />
          </Box>

          <Box>
            <Text fw={600} size="xs" mb={4}>Printed on the report</Text>
            <Stack gap={6}>
              <Textarea size="xs" label="Equipment" autosize minRows={2} value={form.equipment_text} onChange={(e) => { const v = e.currentTarget.value; setField('equipment_text', v) }} />
              <Textarea size="xs" label="Calibration" autosize minRows={2} value={form.calibration_text} onChange={(e) => { const v = e.currentTarget.value; setField('calibration_text', v) }} />
              <Textarea size="xs" label="Notes" autosize minRows={2} value={form.notes_text} onChange={(e) => { const v = e.currentTarget.value; setField('notes_text', v) }} />
            </Stack>
          </Box>

          <SafeError message={error} />

          <MonitoringActions
            config={config}
            latest={latest}
            saving={creating || updating}
            deleting={deleting}
            onSave={save}
            onRemove={removeSetup}
            onCancel={() => { setSetupOpen(false); setError(null) }}
          />
        </Stack>
      )}
    </Box>
  )
}
