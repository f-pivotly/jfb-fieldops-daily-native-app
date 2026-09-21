import { useEffect, useMemo, useState } from 'react'
import { Box, Text, Table, Stack, Group, TextInput, Textarea, Image, SimpleGrid, Alert } from '@mantine/core'
import SafeError from '../../../components/SafeError'
import { downloadAttachment } from '../../../data'
import { useAirMonitoringConfig } from '../../../hooks/monitoring/useAirMonitoringConfig'
import { useAirQualityReadings } from '../../../hooks/monitoring/useAirQualityReadings'
import { useAirMonitoringDaily } from '../../../hooks/monitoring/useAirMonitoringDaily'
import { useAirMonitoringDailyForm } from '../../../hooks/monitoring/useAirMonitoringDailyForm'
import { buildAirDay } from '../../../lib/airQuality/data'
import { buildAirChartSpecs, renderAirChart } from '../../../lib/airQuality/chart'

function useAttachmentImageUrl(fileId) {
  const [resolved, setResolved] = useState({ fileId: null, url: null })
  useEffect(() => {
    if (!fileId) return
    let objectUrl = null
    let cancelled = false
    downloadAttachment(fileId).then((blob) => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setResolved({ fileId, url: objectUrl })
    }).catch(() => { if (!cancelled) setResolved({ fileId, url: null }) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileId])
  return fileId && resolved.fileId === fileId ? resolved.url : null
}

function fmt(v) {
  return v === null || v === undefined ? '—' : v.toFixed(3)
}

export default function AirQualityTab({ project, report }) {
  const { config, loading: configLoading, error: configError } = useAirMonitoringConfig(project?.id)
  const { readings, error: readingsError } = useAirQualityReadings(config, report?.report_date)
  const dailyHook = useAirMonitoringDaily(report?.id)
  const form = useAirMonitoringDailyForm({
    projectId: project?.id,
    reportId: report?.id,
    dailyRow: dailyHook.daily,
    create: dailyHook.create,
    update: dailyHook.update,
  })

  const [activity, setActivity] = useState(dailyHook.daily?.activity ?? '')
  const [notes, setNotes] = useState(dailyHook.daily?.notes ?? '')
  const [savedAt, setSavedAt] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const loadError = configError || readingsError || dailyHook.error
  const displayError = saveError || loadError
  const aerialUrl = useAttachmentImageUrl(config?.aerial_path)

  const dailyKey = `${report?.id ?? 'none'}|${dailyHook.daily?.id ?? 'none'}`
  const [prevDailyKey, setPrevDailyKey] = useState(dailyKey)
  if (dailyKey !== prevDailyKey) {
    setPrevDailyKey(dailyKey)
    setActivity(dailyHook.daily?.activity ?? '')
    setNotes(dailyHook.daily?.notes ?? '')
  }

  const day = useMemo(
    () => (config ? buildAirDay(config, readings, report?.report_date) : null),
    [config, readings, report?.report_date],
  )

  const charts = useMemo(() => {
    if (!day || day.populatedCount === 0) return null
    try {
      const specs = buildAirChartSpecs(day, config.stations, config.thresholds)
      return { llra: renderAirChart(day, specs.llra).dataUrl, mbp: renderAirChart(day, specs.mbp).dataUrl }
    } catch {
      return null
    }
  }, [day, config])

  if (configLoading) return <Text size="sm" c="dimmed">Loading air quality data...</Text>
  if (!config) return <Text size="sm" c="dimmed">No air monitoring configured for this project.</Text>

  async function flush() {
    try {
      await form.flush()
      setSavedAt(new Date())
      setSaveError(null)
    } catch (err) {
      setSaveError(err.message || 'Failed to save.')
    }
  }

  return (
    <Stack gap="md">
      <SafeError message={displayError} />

      {}
      <Box p="md" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
        <Group justify="space-between" wrap="wrap">
          <Box>
            <Text size="xs" tt="uppercase" c="dimmed">PM10 -- 15-min TWA</Text>
            <Text size="sm">
              {day?.populatedCount ?? 0} of {day?.slots.length ?? 0} intervals reported ·{' '}
              {config.stations.length} stations · pulled automatically from SGS SmartSense
            </Text>
          </Box>
          {savedAt && <Text size="xs" c="dimmed">Saved {savedAt.toLocaleTimeString()}</Text>}
        </Group>
      </Box>

      {day?.populatedCount === 0 && (
        <Alert color="yellow" variant="light">
          No readings pulled for this date yet. The hourly SmartSense pull fills this in
          automatically.
        </Alert>
      )}

      {}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Box p="md" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
          <Text size="sm" fw={600} mb={6}>Project activity today</Text>
          <TextInput
            value={activity}
            onChange={(e) => { setActivity(e.target.value); form.onFieldChange('activity', e.target.value || null) }}
            onBlur={() => void flush()}
            placeholder="e.g. Mobilization"
          />
        </Box>
        <Box p="md" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
          <Text size="sm" fw={600} mb={6}>Notes</Text>
          <Textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); form.onFieldChange('notes', e.target.value || null) }}
            onBlur={() => void flush()}
            minRows={2}
            placeholder="Station outages, exceedance explanations, etc."
          />
        </Box>
      </SimpleGrid>

      {}
      {aerialUrl && (
        <Box p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
          <Image src={aerialUrl} alt="Air monitoring stations aerial" fit="contain" mx="auto" style={{ maxWidth: 700 }} />
        </Box>
      )}

      {}
      {charts && (
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          <Box p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
            <Image src={charts.llra} alt="Air monitoring - LLRA" fit="contain" />
          </Box>
          <Box p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
            <Image src={charts.mbp} alt="Air monitoring - Mineral Building Property" fit="contain" />
          </Box>
        </SimpleGrid>
      )}

      {}
      <Box style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6, overflow: 'hidden' }}>
        <Box style={{ maxHeight: 480, overflowY: 'auto' }}>
          <Table withTableBorder={false} verticalSpacing={4} fz="sm" stickyHeader>
            <Table.Thead bg="gray.0">
              <Table.Tr>
                <Table.Th>Time</Table.Th>
                {config.stations.map((s) => (
                  <Table.Th key={s.key} ta="right">{s.label}</Table.Th>
                ))}
                <Table.Th ta="right">Alert</Table.Th>
                <Table.Th ta="right">Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {day?.slots.map((s) => (
                <Table.Tr key={s.utcISO}>
                  <Table.Td>{s.timeLabel}</Table.Td>
                  {config.stations.map((st) => (
                    <Table.Td key={st.key} ta="right">{fmt(s.values[st.key] ?? null)}</Table.Td>
                  ))}
                  <Table.Td ta="right" c="#b45309">{fmt(s.alertLevel)}</Table.Td>
                  <Table.Td ta="right" c="#b91c1c">{fmt(s.actionLevel)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
        <Text size="xs" c="dimmed" p="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
          All values mg/m³, 15-minute time-weighted averages. Alert/Action ={' '}
          {config.thresholds?.alert_offset_mgm3 ?? '—'} / {config.thresholds?.action_offset_mgm3 ?? '—'} mg/m³
          above the minimum beach-station value per interval.
        </Text>
      </Box>
    </Stack>
  )
}
