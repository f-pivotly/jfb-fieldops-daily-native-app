import { Box, Text, Group, Button, Select, TextInput, NumberInput } from '@mantine/core'
import SafeError from '../../../../components/SafeError'
import { DEFAULT_TIMEZONE, PRIMARY_BUTTON, formatReadingTime, timezoneOptions } from '../../lib/monitoringForm'

export function MonitoringHeader({ title, savedAt, children }) {
  return (
    <Box mb={10}>
      <Group justify="space-between" mb={2}>
        <Text fw={700} size="sm">{title}</Text>
        {savedAt && <Text size="10px" tt="uppercase" c="green" fw={600}>Saved ✓</Text>}
      </Group>
      <Text size="xs" c="dimmed">{children}</Text>
    </Box>
  )
}

export function MonitoringProjectLine({ project }) {
  return (
    <Box p={10} mb={12} style={{ background: 'var(--mantine-color-gray-0)', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
      <Text size="xs">
        Readings are saved to <Text span fw={700}>{project?.name ?? '—'}</Text>
        {' · '}Project code <Text span fw={700}>#{project?.project_code ?? '—'}</Text>
      </Text>
    </Box>
  )
}

export function ScheduleInputs({ form, setField }) {
  return (
    <Group align="flex-end" gap="md" wrap="wrap">
      <Select
        label="Timezone" size="xs" w={200} allowDeselect={false}
        data={timezoneOptions(form.timezone)}
        value={form.timezone}
        onChange={(v) => setField('timezone', v ?? DEFAULT_TIMEZONE)}
      />
      <TextInput
        label="Report window start" size="xs" type="time" w={150}
        value={form.window_start}
        onChange={(e) => setField('window_start', e.currentTarget.value)}
      />
      <TextInput
        label="Report window end" size="xs" type="time" w={150}
        value={form.window_end}
        onChange={(e) => setField('window_end', e.currentTarget.value)}
      />
      <NumberInput
        label="Interval (minutes)" size="xs" w={140} min={1} max={1440} allowDecimal={false}
        value={form.interval_minutes}
        onChange={(v) => setField('interval_minutes', v)}
      />
    </Group>
  )
}

export function ThresholdInputs({ fields, drafts, onChange }) {
  return (
    <Group align="flex-end" gap="md" wrap="wrap">
      {fields.map((f) => (
        <TextInput
          key={f.key} label={f.label} size="xs" type="number" w={220}
          value={drafts[f.key] ?? ''}
          onChange={(e) => { const v = e.currentTarget.value; onChange(f.key, v) }}
        />
      ))}
    </Group>
  )
}

export function NotSetUp({ label, onStart }) {
  return (
    <Group justify="space-between">
      <Text size="xs" c="dimmed" fs="italic">Not set up for this project.</Text>
      <Button size="xs" onClick={onStart} style={PRIMARY_BUTTON}>{label}</Button>
    </Group>
  )
}

function LatestReadingLine({ latest, timeZone }) {
  if (latest.loading) return <Text size="xs" c="dimmed">Checking for readings...</Text>
  if (latest.error) return <SafeError message={latest.error} />
  if (!latest.row) return <Text size="xs" c="dimmed">No readings yet. They appear after the next pull.</Text>
  return <Text size="xs" c="dimmed">Last reading: {formatReadingTime(latest.row.reading_at, timeZone)}</Text>
}

export function MonitoringActions({ config, latest, saving, deleting, onSave, onRemove, onCancel }) {
  return (
    <Group justify="space-between" align="center">
      {config ? <LatestReadingLine latest={latest} timeZone={config.timezone} /> : <Box />}
      <Group gap="xs">
        {config && (
          <Button size="xs" variant="subtle" color="red" loading={deleting} onClick={onRemove}>Remove</Button>
        )}
        {!config && (
          <Button size="xs" variant="default" onClick={onCancel}>Cancel</Button>
        )}
        <Button size="xs" loading={saving} onClick={onSave} style={PRIMARY_BUTTON}>
          {config ? 'Save changes' : 'Save'}
        </Button>
      </Group>
    </Group>
  )
}
