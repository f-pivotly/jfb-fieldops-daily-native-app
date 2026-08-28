import { Table, TextInput, Text, Badge, Box, Group, Button, Modal, Select, Stack, Switch, Loader } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { IconSettings, IconTrash } from '@tabler/icons-react'
import { useMetricSources } from '../../../hooks/useMetricSources'
import { useMetricDefaults } from '../../../hooks/useMetricDefaults'
import { useMetrics } from '../../../hooks/useMetrics'
import { useReports } from '../../../hooks/useReports'
import { useReportMetricValues } from '../../../hooks/useReportMetricValues'
import { useManualMetricValues } from '../../../hooks/useManualMetricValues'
import { useAutoMetricValues } from '../../../hooks/useAutoMetricValues'
import { formatMetricValue } from '../../../config/metricAutoSources'

function slugify(label) {
  const trimmed = label.trim().toLowerCase()
  let result = ''
  let lastWasSeparator = true
  for (const ch of trimmed) {
    const isAlnum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')
    if (isAlnum) {
      result += ch
      lastWasSeparator = false
    } else if (!lastWasSeparator) {
      result += '_'
      lastWasSeparator = true
    }
  }
  if (result.endsWith('_')) result = result.slice(0, -1)
  return result || 'metric'
}

function metricsToRows(metrics) {
  return metrics
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((m) => ({
      key: m.id,
      metricId: m.id,
      metricKey: m.metric_key,
      label: m.label,
      source: m.source === 'manual' ? 'Manual' : 'Auto',
      autoKind: m.source === 'manual' ? null : m.source,
      unit: m.unit ?? '',
      equipmentId: m.equipment_id ?? null,
      day: 0,
      week: 0,
      total: 0,
      hidden: m.active === false,
    }))
}

function defaultsToRows(metricDefaults) {
  return metricDefaults
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((d) => ({
      key: `default-${d.metric_key}`,
      metricId: null,
      metricKey: d.metric_key,
      label: d.label,
      source: d.source === 'manual' ? 'Manual' : 'Auto',
      autoKind: d.source === 'manual' ? null : d.source,
      unit: d.unit ?? '',
      equipmentId: null,
      day: 0,
      week: 0,
      total: 0,
      hidden: false,
      isDefault: true,
    }))
}

export default function MetricsTab({ project, report, equipment = [] }) {
  const [rows, setRows] = useState([])
  const [managerOpen, setManagerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const visible = rows.filter((r) => !r.hidden)

  const { metricSources } = useMetricSources()
  const activeSources = metricSources.filter((m) => m.active !== false)
  const sourceValues = activeSources.map((m) => m.value)
  const sourceLabels = Object.fromEntries(activeSources.map((m) => [m.value, m.label ?? m.value]))
  const { metricDefaults, loading: defaultsLoading } = useMetricDefaults()
  const { metrics, loading: metricsLoading, create, update, remove, reload } = useMetrics(project?.id)
  const { reports } = useReports(project?.id)
  const {
    reportMetricValues,
    create: createValue,
    update: updateValue,
    reload: reloadValues,
  } = useReportMetricValues()
  const manual = useManualMetricValues({
    project, report, reports, reportMetricValues,
    create: createValue, update: updateValue, reload: reloadValues,
  })

  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current || rows.length > 0 || metricsLoading || defaultsLoading) return
    if (metrics.length > 0) {
      setRows(metricsToRows(metrics))
      seededRef.current = true
    } else if (metricDefaults.length > 0) {
      setRows(defaultsToRows(metricDefaults))
      seededRef.current = true
    }
  }, [rows.length, metricsLoading, defaultsLoading, metrics, metricDefaults])

  const totalStartDate = project?.start_date ? project.start_date.slice(0, 10) : '1900-01-01'
  const autoValues = useAutoMetricValues(rows, {
    projectId: project?.id,
    endDate: report?.report_date,
    totalStartDate,
    metricSources,
  })

  const usingDefaults = rows.some((r) => r.isDefault)

  async function handleSaveMetrics() {
    setSaving(true)
    try {
      const keptIds = new Set(rows.filter((r) => r.metricId).map((r) => r.metricId))
      const removedIds = metrics.map((m) => m.id).filter((id) => !keptIds.has(id))

      await Promise.all([
        ...rows
          .filter((r) => r.label.trim())
          .map((r, i) => {
            const data = {
              project_id: project.id,
              metric_key: r.metricKey || slugify(r.label),
              label: r.label,
              source: r.source === 'Manual' ? 'manual' : r.autoKind,
              equipment_id: r.equipmentId || null,
              unit: r.unit || null,
              sort_order: (i + 1) * 10,
              active: !r.hidden,
            }
            return r.metricId ? update(r.metricId, data) : create(data)
          }),
        ...removedIds.map((id) => remove(id)),
      ])
      seededRef.current = false
      setRows([])
      await reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Group justify="space-between" align="center" mb={10}>
        {usingDefaults ? (
          <Text size="xs" c="orange">Using default metrics — not yet saved for this project.</Text>
        ) : <Box />}
        <Button size="xs" variant="default" leftSection={<IconSettings size={12} />} onClick={() => setManagerOpen(true)}>
          Manage metrics
        </Button>
      </Group>

      <Table withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Metric</Table.Th>
            <Table.Th>Source</Table.Th>
            <Table.Th ta="right">Day</Table.Th>
            <Table.Th ta="right">Week</Table.Th>
            <Table.Th ta="right">Total</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visible.map((r) => {
            const auto = r.source === 'Auto' ? autoValues[r.key] : null
            return (
              <Table.Tr key={r.key}>
                <Table.Td>{r.label}</Table.Td>
                <Table.Td>
                  <Badge size="xs" variant="light" color={r.source === 'Auto' ? 'blue' : 'gray'}>
                    <SourceLabel r={r} sourceLabels={sourceLabels} />
                  </Badge>
                </Table.Td>
                <Table.Td ta="right">
                  <MetricValueCell r={r} field="day" auto={auto} manual={manual} setRows={setRows} />
                </Table.Td>
                <Table.Td ta="right">
                  <MetricValueCell r={r} field="week" auto={auto} manual={manual} setRows={setRows} />
                </Table.Td>
                <Table.Td ta="right">
                  <MetricValueCell r={r} field="total" auto={auto} manual={manual} setRows={setRows} />
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>

      <MetricsManagerDialog
        opened={managerOpen}
        onClose={() => setManagerOpen(false)}
        rows={rows}
        setRows={setRows}
        sourceValues={sourceValues}
        sourceLabels={sourceLabels}
        metricSources={metricSources}
        equipment={equipment}
        onSave={handleSaveMetrics}
        saving={saving}
      />
    </Box>
  )
}

function AutoValueText({ auto, field, unit }) {
  if (!auto) return <Loader size={12} />
  return <Text size="sm">{formatMetricValue(auto[field], unit)}</Text>
}

function MetricValueCell({ r, field, auto, manual, setRows }) {
  if (r.source === 'Auto') {
    return <AutoValueText auto={auto} field={field} unit={r.unit} />
  }
  if (!r.metricId) {
    if (field === 'week') return <Text size="sm">{r.week}</Text>
    if (field === 'total') return <Text size="sm">{Number(r.total).toLocaleString()}</Text>
    return (
      <TextInput
        size="xs"
        value={r.day}
        onChange={(e) => {
          const v = e.currentTarget.value === '' ? '' : Number(e.currentTarget.value)
          setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, day: v } : x)))
        }}
      />
    )
  }
  const persisted = manual.valuesFor(r.metricId)
  if (field === 'day') {
    const draftValue = r.metricId in manual.drafts ? manual.drafts[r.metricId] : (persisted.day ?? '')
    return (
      <TextInput
        size="xs"
        value={draftValue}
        onChange={(e) => manual.onManualChange(r.metricId, e.currentTarget.value)}
        onBlur={() => manual.flush(r.metricId)}
      />
    )
  }
  return <Text size="sm">{formatMetricValue(persisted[field], r.unit)}</Text>
}

function SourceLabel({ r, sourceLabels }) {
  if (r.source !== 'Auto') return sourceLabels.manual ?? 'Manual'
  return sourceLabels[r.autoKind] ?? r.autoKind
}

function MetricsManagerDialog({ opened, onClose, rows, setRows, sourceValues, sourceLabels, metricSources, equipment, onSave, saving }) {
  const [newLabel, setNewLabel] = useState('')

  function update(key, patch) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function move(index, dir) {
    setRows((prev) => {
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
    setRows((prev) => prev.filter((r) => r.key !== key))
  }
  function addMetric() {
    if (!newLabel.trim()) return
    setRows((prev) => [
      ...prev,
      { key: `metric-${Date.now()}`, metricId: null, metricKey: null, label: newLabel.trim(), source: 'Manual', autoKind: null, unit: '', equipmentId: null, day: 0, week: 0, total: 0, hidden: false },
    ])
    setNewLabel('')
  }
  function setSource(key, value) {
    if (!value || value === 'manual') {
      update(key, { source: 'Manual', autoKind: null })
      return
    }
    const sourceRow = metricSources.find((m) => m.value === value)
    update(key, { source: 'Auto', autoKind: value, unit: sourceRow?.unit ?? '' })
  }

  const sourceOptions = [
    { value: 'manual', label: sourceLabels.manual ?? 'Manual (PE enters daily)' },
    ...sourceValues.filter((v) => v !== 'manual').map((v) => ({ value: v, label: sourceLabels[v] ?? v })),
  ]

  const equipmentOptions = [
    { value: '', label: 'All equipment' },
    ...equipment.map((eq) => ({ value: eq.id, label: eq.name })),
  ]

  async function handleSave() {
    await onSave()
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700} size="sm">Manage Metrics</Text>} size="lg">
      <Stack gap={10} mb={16}>
        {rows.map((r, i) => (
          <Box key={r.key} p={8} style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 6 }}>
            <Group gap={8} wrap="nowrap" align="flex-end">
              <TextInput size="xs" label="Label" value={r.label} onChange={(e) => update(r.key, { label: e.currentTarget.value })} style={{ flex: 1.4 }} />
              <Select
                size="xs"
                label="Source"
                data={sourceOptions}
                value={r.source === 'Manual' ? 'manual' : r.autoKind}
                onChange={(v) => setSource(r.key, v)}
                style={{ flex: 1.3 }}
              />
              <TextInput size="xs" label="Unit" value={r.unit} onChange={(e) => update(r.key, { unit: e.currentTarget.value })} w={70} />
              <Switch size="xs" mb={6} checked={!r.hidden} onChange={() => update(r.key, { hidden: !r.hidden })} label="Visible" />
              <Button size="xs" variant="subtle" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
              <Button size="xs" variant="subtle" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>↓</Button>
              <Box onClick={() => remove(r.key)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex', paddingBottom: 8 }}>
                <IconTrash size={13} />
              </Box>
            </Group>
            {r.source === 'Auto' && (
              <Select
                size="xs"
                label="Equipment"
                description="Which unit this Auto metric sums. Leave as All equipment for a project-wide total."
                data={equipmentOptions}
                value={r.equipmentId ?? ''}
                onChange={(v) => update(r.key, { equipmentId: v || null })}
                mt={8}
                w={260}
              />
            )}
          </Box>
        ))}
      </Stack>
      <Group gap={8}>
        <TextInput size="xs" placeholder="New metric label" value={newLabel} onChange={(e) => setNewLabel(e.currentTarget.value)} style={{ flex: 1 }} />
        <Button size="xs" onClick={addMetric} disabled={!newLabel.trim()} style={{ background: '#0F2744', border: 'none' }}>Add</Button>
      </Group>
      <Group justify="flex-end" gap={8} mt={16}>
        <Button size="xs" variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="xs" onClick={handleSave} loading={saving} style={{ background: '#0F2744', border: 'none' }}>Save metrics</Button>
      </Group>
    </Modal>
  )
}
