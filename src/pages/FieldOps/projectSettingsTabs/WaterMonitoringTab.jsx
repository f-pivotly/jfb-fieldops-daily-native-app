import { useState } from 'react'
import { Box, Text, Select, TextInput, Table, Switch, Stack } from '@mantine/core'
import { useWaterMonitoringConfig } from '../../../hooks/monitoring/useWaterMonitoringConfig'
import { useLatestReading, useSavedFlash } from '../../../hooks/monitoring/useMonitoringSettings'
import { useConfirmDialog } from '../../../hooks/ui/useConfirmDialog'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'
import { DEFAULT_TIMEZONE, DIGITS, buildThresholds, checkSchedule, scheduleFields, textOf, thresholdDrafts, toHhmm } from '../lib/monitoringForm'
import { MonitoringActions, MonitoringHeader, MonitoringProjectLine, NotSetUp, ScheduleInputs, ThresholdInputs } from './components/MonitoringFormParts'

const WATER_PROVIDERS = {
  hydrovu: {
    label: 'HydroVu (In-Situ)',
    account: 'HydroVu',
    deviceField: 'hydrovu_location_id',
    deviceLabel: 'HydroVu location ID',
    numericDevice: false,
    roles: [
      { role: 'background', label: 'Background' },
      { role: 'early_warning', label: 'Early Warning' },
      { role: 'compliance', label: 'Compliance' },
    ],
    thresholds: [
      { key: 'early_warning_ntu', label: 'Early warning (NTU)' },
      { key: 'compliance_4hr_ntu', label: 'Compliance 4-hr (NTU)' },
      { key: 'compliance_1hr_ntu', label: 'Compliance 1-hr (NTU)' },
      { key: 'background_multiplier', label: 'Background multiplier (x)' },
    ],
    defaults: { window_start: '06:00', window_end: '18:00', interval_minutes: 15 },
    initialMode: 'compliance',
  },
  wqdatalive: {
    label: 'WQData LIVE (NexSens, tidal)',
    account: 'WQData LIVE',
    deviceField: 'wqdatalive_device_id',
    deviceLabel: 'WQData device ID',
    numericDevice: true,
    roles: [
      { role: 'upstream', label: 'Upstream' },
      { role: 'downstream', label: 'Downstream' },
    ],
    thresholds: [
      { key: 'early_warning_delta_ntu', label: 'Response action (+NTU over background)' },
      { key: 'compliance_delta_ntu', label: 'Not-to-exceed (+NTU over background)' },
    ],
    defaults: { window_start: '00:00', window_end: '23:00', interval_minutes: 60 },
    initialMode: 'background',
  },
}

const PROVIDER_OPTIONS = Object.entries(WATER_PROVIDERS).map(([value, spec]) => ({ value, label: spec.label }))
const ALL_THRESHOLD_KEYS = Object.values(WATER_PROVIDERS).flatMap((spec) => spec.thresholds.map((t) => t.key))
const DEVICE_KEYS = ['hydrovu_location_id', 'wqdatalive_device_id', 'device_id']

function monitorRows(provider, locations) {
  const spec = WATER_PROVIDERS[provider]
  const list = Array.isArray(locations) ? locations : []
  return spec.roles.map(({ role, label }) => {
    const existing = list.find((l) => l?.role === role)
    const deviceId = existing?.[spec.deviceField] ?? (provider === 'wqdatalive' ? existing?.device_id : undefined)
    return {
      role,
      roleLabel: label,
      label: existing?.label ?? label,
      device_id: textOf(deviceId),
      display_coords: existing?.display_coords ?? '',
      extra: existing ?? {},
    }
  })
}

function formFrom(config, project) {
  const provider = WATER_PROVIDERS[config?.provider] ? config.provider : 'hydrovu'
  const spec = WATER_PROVIDERS[provider]
  return {
    provider,
    timezone: config?.timezone || project?.report_timezone || DEFAULT_TIMEZONE,
    window_start: toHhmm(config?.window_start, spec.defaults.window_start),
    window_end: toHhmm(config?.window_end, spec.defaults.window_end),
    interval_minutes: config?.interval_minutes ?? spec.defaults.interval_minutes,
    monitors: monitorRows(provider, config?.locations),
    thresholds: thresholdDrafts(spec.thresholds, config?.thresholds),
    active: config ? config.active !== false : true,
  }
}

function buildLocations(provider, monitors) {
  const spec = WATER_PROVIDERS[provider]
  const seen = new Set()
  const locations = []
  for (const m of monitors) {
    const id = m.device_id.trim()
    if (!id) continue
    if (!DIGITS.test(id)) return { error: `${m.roleLabel}: ${spec.deviceLabel} must be digits only.` }
    if (seen.has(id)) return { error: `${spec.deviceLabel} ${id} is listed more than once.` }
    seen.add(id)
    const base = { ...m.extra }
    for (const k of DEVICE_KEYS) delete base[k]
    locations.push({
      ...base,
      role: m.role,
      label: m.label.trim() || m.roleLabel,
      [spec.deviceField]: spec.numericDevice ? Number(id) : id,
      display_coords: m.display_coords.trim() || null,
    })
  }
  if (!locations.length) return { error: `Enter at least one ${spec.deviceLabel}.` }
  return { value: locations }
}

export default function WaterMonitoringTab({ project }) {
  const { config, loading, error: loadError, creating, updating, deleting, create, update, remove } = useWaterMonitoringConfig(project?.id)
  const latest = useLatestReading('jfb_water_quality_readings', project?.id, !!config)
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

  const spec = WATER_PROVIDERS[form.provider]
  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const setMonitor = (role, field, value) =>
    setForm((f) => ({ ...f, monitors: f.monitors.map((m) => (m.role === role ? { ...m, [field]: value } : m)) }))

  function changeProvider(next) {
    if (!next || next === form.provider) return
    const nextSpec = WATER_PROVIDERS[next]
    setForm((f) => ({
      ...f,
      provider: next,
      monitors: monitorRows(next, config?.provider === next ? config.locations : []),
      thresholds: thresholdDrafts(nextSpec.thresholds, config?.provider === next ? config.thresholds : null),
      ...(config ? {} : nextSpec.defaults),
    }))
  }

  async function save() {
    setError(null)
    const scheduleError = checkSchedule(form)
    if (scheduleError) return setError(scheduleError)
    const locations = buildLocations(form.provider, form.monitors)
    if (locations.error) return setError(locations.error)
    const thresholds = buildThresholds(spec.thresholds, form.thresholds, config?.thresholds, ALL_THRESHOLD_KEYS)
    if (thresholds.error) return setError(thresholds.error)
    const record = {
      provider: form.provider,
      ...scheduleFields(form),
      locations: locations.value,
      thresholds: thresholds.value,
      active: form.active,
    }
    try {
      if (config?.id) await update(config.id, record)
      else await create({ ...record, project_id: project.id, mode: spec.initialMode })
      setSetupOpen(false)
      setSavedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save water monitoring.')
    }
  }

  async function removeSetup() {
    if (!config?.id) return
    if (!(await confirm('Remove water monitoring from this project? New readings stop being pulled and the Water Quality report tab shows "not configured". Readings already pulled are kept.'))) return
    setError(null)
    try {
      await remove(config.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove water monitoring.')
    }
  }

  if (!project?.id) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Select a project to manage its water monitoring.</Text>
  }

  const showForm = !!config || setupOpen

  return (
    <Box>
      {confirmModal}
      <MonitoringHeader title="Water Quality Monitoring" savedAt={savedAt}>
        Turbidity readings are pulled automatically for the device IDs below and shown on the report's Water Quality tab.
        The devices must be in JFB's {spec.account} account.
      </MonitoringHeader>
      <MonitoringProjectLine project={project} />

      {loading && <LoadingSpinner py={16} />}
      {!loading && <SafeError message={loadError} mb={8} />}

      {!loading && !loadError && !showForm && (
        <NotSetUp label="Set up water monitoring" onStart={() => setSetupOpen(true)} />
      )}

      {!loading && !loadError && showForm && (
        <Stack gap="sm">
          <Select
            label="Provider" size="xs" w={260} allowDeselect={false}
            data={PROVIDER_OPTIONS}
            value={form.provider}
            onChange={changeProvider}
          />
          <ScheduleInputs form={form} setField={setField} />

          <Box>
            <Text fw={600} size="xs" mb={4}>Monitors</Text>
            <Table withTableBorder verticalSpacing={4} fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Report column</Table.Th>
                  <Table.Th>Label</Table.Th>
                  <Table.Th>{spec.deviceLabel}</Table.Th>
                  <Table.Th>Coordinates (X, Y)</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {form.monitors.map((m) => (
                  <Table.Tr key={m.role}>
                    <Table.Td>{m.roleLabel}</Table.Td>
                    <Table.Td>
                      <TextInput size="xs" value={m.label} onChange={(e) => { const v = e.currentTarget.value; setMonitor(m.role, 'label', v) }} />
                    </Table.Td>
                    <Table.Td>
                      <TextInput size="xs" placeholder="Leave blank if not used" value={m.device_id} onChange={(e) => { const v = e.currentTarget.value; setMonitor(m.role, 'device_id', v) }} />
                    </Table.Td>
                    <Table.Td>
                      <TextInput size="xs" value={m.display_coords} onChange={(e) => { const v = e.currentTarget.value; setMonitor(m.role, 'display_coords', v) }} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>

          <Box>
            <Text fw={600} size="xs" mb={4}>Limit lines</Text>
            <ThresholdInputs
              fields={spec.thresholds}
              drafts={form.thresholds}
              onChange={(key, v) => setForm((f) => ({ ...f, thresholds: { ...f.thresholds, [key]: v } }))}
            />
          </Box>

          <Switch
            size="xs" label="Show the Water Quality tab on reports"
            checked={form.active}
            onChange={(e) => { const v = e.currentTarget.checked; setField('active', v) }}
          />

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
