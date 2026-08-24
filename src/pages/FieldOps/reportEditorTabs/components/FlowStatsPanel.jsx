import { useEffect, useRef, useState } from 'react'
import { Box, Text, TextInput, Group, Button } from '@mantine/core'
import { IconTrash, IconPlus } from '@tabler/icons-react'
import { useHydraulicFlowStats } from '../hooks/useHydraulicFlowStats'
import { useHydraulicPipeConfigurations } from '../hooks/useHydraulicPipeConfigurations'
import { useConfirmDialog } from '../../../../hooks/useConfirmDialog'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import SafeError from '../../../../components/SafeError'

// Mirrors the real web app's Flow Stats + Pipe Configuration panels
// (jfb-fieldops-daily's src/components/FlowStatsPanel.tsx), adapted to the
// native domains: jfb_hydraulic_flow_stats / jfb_hydraulic_pipe_configurations
// key by project_id + log_date (a plain date) instead of report_id, and carry
// a real equipment_id FK instead of a denormalized equipment name.
//
// Daily Total Flow / Previous Total / Project Total render as dimmed
// placeholders on purpose -- the native flow-stats domain has no
// daily_total_gal column ("everything else derives and is therefore not
// stored"), and there's no operating-hours source to derive it from anyway
// (jfb_daily_activities has no category field to separate productive time
// from delays -- same gap as the Production Stats table's GOH/NOH columns).

// ── Pipe geometry -- pure math, ported as-is from the real app ───────────
function pipeAreaFt2(diameterIn) {
  return Math.PI * (diameterIn / 24) ** 2
}
function gpmFromVelocity(velocityFps, diameterIn) {
  return velocityFps * pipeAreaFt2(diameterIn) * 448.831
}
function velocityFromGpm(gpmFlow, diameterIn) {
  return gpmFlow / (pipeAreaFt2(diameterIn) * 448.831)
}
function roundForDisplay(n, digits) {
  if (!Number.isFinite(n)) return ''
  return Number(n.toFixed(digits)).toString()
}
function parseNum(s) {
  const v = String(s ?? '').trim()
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function formatNum(n) {
  return n === null || n === undefined ? '' : String(n)
}
function dateOnly(iso) {
  return iso ? String(iso).slice(0, 10) : null
}
function formatPriorDate(iso) {
  const [, m, d] = String(iso).split('-')
  return m && d ? `${Number(m)}/${Number(d)}` : iso
}

export function FlowStatsPanel({ projectId, equipmentId, reportDateISO }) {
  const { flowStats, loading, error, create, update } = useHydraulicFlowStats(projectId)

  const todaysRow = flowStats.find(
    (r) => r.equipment_id === equipmentId && dateOnly(r.log_date) === reportDateISO,
  )
  const priorRow = flowStats
    .filter((r) => r.equipment_id === equipmentId && dateOnly(r.log_date) < reportDateISO && r.pipe_dia_inches != null)
    .sort((a, b) => (dateOnly(a.log_date) < dateOnly(b.log_date) ? 1 : -1))[0]

  // No sync-effect here on purpose: local edit state is a small overlay on
  // top of the fetched row (same `edits` pattern as ProductionStatsTab.jsx
  // and PipeConfigPanel below), not a copy kept in sync via useEffect.
  // The parent passes a `key` that changes with equipmentId/reportDateISO,
  // so switching equipment or date remounts this panel and clears `edits`
  // naturally instead of needing an effect to reset it.
  const [edits, setEdits] = useState({})
  const [savedAt, setSavedAt] = useState(null)
  const lastEditedRef = useRef(null) // 'velocity' | 'flowRate'

  const baseDiameter = formatNum(todaysRow ? todaysRow.pipe_dia_inches : priorRow?.pipe_dia_inches)
  const baseVelocity = formatNum(todaysRow?.avg_line_velocity)
  const baseFlowRate = formatNum(todaysRow?.avg_flow_rate)

  const diameter = 'diameter' in edits ? edits.diameter : baseDiameter
  const velocity = 'velocity' in edits ? edits.velocity : baseVelocity
  const flowRate = 'flowRate' in edits ? edits.flowRate : baseFlowRate
  const carriedFrom = !todaysRow && !('diameter' in edits) && priorRow ? dateOnly(priorRow.log_date) : null

  function handleDiameterChange(v) {
    const d = parseNum(v)
    const patch = { diameter: v }
    if (d && d > 0) {
      if (lastEditedRef.current === 'flowRate') {
        const r = parseNum(flowRate)
        if (r !== null) patch.velocity = roundForDisplay(velocityFromGpm(r, d), 2)
      } else {
        const vel = parseNum(velocity)
        if (vel !== null) patch.flowRate = roundForDisplay(gpmFromVelocity(vel, d), 0)
      }
    }
    setEdits((prev) => ({ ...prev, ...patch }))
  }

  function handleVelocityChange(v) {
    lastEditedRef.current = 'velocity'
    const d = parseNum(diameter)
    const vel = parseNum(v)
    const patch = { velocity: v }
    if (d && d > 0 && vel !== null) patch.flowRate = roundForDisplay(gpmFromVelocity(vel, d), 0)
    setEdits((prev) => ({ ...prev, ...patch }))
  }

  function handleFlowRateChange(v) {
    lastEditedRef.current = 'flowRate'
    const d = parseNum(diameter)
    const r = parseNum(v)
    const patch = { flowRate: v }
    if (d && d > 0 && r !== null) patch.velocity = roundForDisplay(velocityFromGpm(r, d), 2)
    setEdits((prev) => ({ ...prev, ...patch }))
  }

  async function handleBlur() {
    if (Object.keys(edits).length === 0) return
    const patch = {
      pipe_dia_inches: parseNum(diameter),
      avg_line_velocity: parseNum(velocity),
      avg_flow_rate: parseNum(flowRate),
    }
    const hasAnyValue = patch.pipe_dia_inches !== null || patch.avg_line_velocity !== null || patch.avg_flow_rate !== null
    setEdits({})
    if (todaysRow) {
      await update(todaysRow.id, patch)
    } else if (hasAnyValue) {
      await create({ project_id: projectId, equipment_id: equipmentId, log_date: reportDateISO, ...patch })
    } else {
      return
    }
    setSavedAt(new Date())
  }

  return (
    <Box style={{ border: '1px solid #ebebeb', borderRadius: 6, padding: 12 }}>
      <Group justify="space-between" mb={8}>
        <Text fw={700} size="sm">Flow Stats</Text>
        {savedAt && <Text size="10px" c="green" tt="uppercase">Saved</Text>}
      </Group>

      {loading && <LoadingSpinner py={12} />}
      <SafeError message={error} />

      {!loading && !equipmentId && (
        <Text size="xs" c="dimmed">Select equipment to enter flow stats.</Text>
      )}

      {!loading && equipmentId && (
        <Box>
          <NumField
            label="Pipe Inside Diameter" unit="in" value={diameter}
            onChange={handleDiameterChange} onBlurCommit={handleBlur}
            helper={carriedFrom
              ? `Carried forward from ${formatPriorDate(carriedFrom)} — edit if pipe changed.`
              : 'Used to convert between velocity and flow rate.'}
          />
          <NumField label="Avg Line Velocity" unit="ft/s" value={velocity} onChange={handleVelocityChange} onBlurCommit={handleBlur} />
          <NumField label="Avg Flow Rate" unit="GPM" value={flowRate} onChange={handleFlowRateChange} onBlurCommit={handleBlur} />
          <DerivedRow label="Daily Total Flow" unit="GAL" />
          <DerivedRow label="Previous Total" unit="GAL" />
          <DerivedRow label="Project Total" unit="GAL" />
          <Text size="10px" c="dimmed" mt={4} fs="italic">
            Totals aren't available yet — no operating-hours or flow-history source in this app.
          </Text>
        </Box>
      )}
    </Box>
  )
}

export function PipeConfigPanel({ projectId, reportDateISO }) {
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { pipeSegments, loading, error, create, update, remove } = useHydraulicPipeConfigurations(projectId)
  const todaysRows = pipeSegments.filter((r) => dateOnly(r.log_date) === reportDateISO)

  const [edits, setEdits] = useState({})
  const [carriedFrom, setCarriedFrom] = useState(null)
  const seeding = useRef(false)

  // Carry-forward: if today has no segments yet, copy the most recent prior
  // date's segments in immediately (persisted right away, unlike the flow
  // stats diameter carry-forward above) -- matches the real app's
  // PipeConfigPanel behavior exactly.
  useEffect(() => {
    if (loading || todaysRows.length > 0 || seeding.current) return
    const priorDates = [...new Set(
      pipeSegments.filter((r) => dateOnly(r.log_date) < reportDateISO).map((r) => dateOnly(r.log_date)),
    )].sort()
    const priorDate = priorDates.at(-1)
    if (!priorDate) return
    const priorRows = pipeSegments.filter((r) => dateOnly(r.log_date) === priorDate)
    if (priorRows.length === 0) return
    seeding.current = true
    ;(async () => {
      for (const row of priorRows) {
        await create({ project_id: projectId, log_date: reportDateISO, segment_name: row.segment_name, length_ft: row.length_ft })
      }
      setCarriedFrom(priorDate)
    })().finally(() => {
      seeding.current = false
    })
  }, [loading, todaysRows.length, pipeSegments, projectId, reportDateISO, create])

  function cellValue(row, field) {
    const key = `${row.id}:${field}`
    return key in edits ? edits[key] : (row[field] ?? '')
  }
  function setCellValue(row, field, value) {
    setEdits((prev) => ({ ...prev, [`${row.id}:${field}`]: value }))
  }
  async function commitCell(row, field, isNumeric) {
    const key = `${row.id}:${field}`
    if (!(key in edits)) return
    const raw = edits[key]
    const value = isNumeric ? (parseNum(raw) ?? 0) : raw
    setEdits((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    if (value === (row[field] ?? (isNumeric ? 0 : ''))) return
    await update(row.id, { [field]: value })
    setCarriedFrom(null)
  }

  async function handleAddSegment() {
    await create({ project_id: projectId, log_date: reportDateISO, segment_name: `Segment ${todaysRows.length + 1}`, length_ft: 0 })
    setCarriedFrom(null)
  }

  async function handleDelete(row) {
    if (!(await confirm('Remove this pipe segment?'))) return
    await remove(row.id)
    setCarriedFrom(null)
  }

  const totalLength = todaysRows.reduce((a, r) => a + (Number(r.length_ft) || 0), 0)

  return (
    <Box style={{ border: '1px solid #ebebeb', borderRadius: 6, padding: 12 }}>
      <Group justify="space-between" mb={8}>
        <Text fw={700} size="sm">Pipe Configuration</Text>
        <Button size="xs" variant="subtle" leftSection={<IconPlus size={12} />} onClick={handleAddSegment}>Add Segment</Button>
      </Group>

      {loading && <LoadingSpinner py={12} />}
      <SafeError message={error} />

      {!loading && carriedFrom && todaysRows.length > 0 && (
        <Text size="10px" c="blue" mb={6}>
          Carried forward from {formatPriorDate(carriedFrom)} — edit or remove segments if the pipe changed.
        </Text>
      )}

      {!loading && todaysRows.length === 0 && (
        <Text size="xs" c="dimmed" ta="center" py={8}>No pipe segments yet.</Text>
      )}

      {!loading && todaysRows.map((row) => (
        <Group key={row.id} gap={6} mb={6} wrap="nowrap" align="flex-end">
          <TextInput
            size="xs" label="Segment Name" style={{ flex: 1 }}
            value={cellValue(row, 'segment_name')}
            onChange={(e) => setCellValue(row, 'segment_name', e.currentTarget.value)}
            onBlur={() => commitCell(row, 'segment_name', false)}
          />
          <TextInput
            size="xs" label="Length ft" ta="right" w={90}
            value={cellValue(row, 'length_ft')}
            onChange={(e) => setCellValue(row, 'length_ft', e.currentTarget.value)}
            onBlur={() => commitCell(row, 'length_ft', true)}
          />
          <Box onClick={() => handleDelete(row)} style={{ cursor: 'pointer', color: '#ef4444', display: 'flex', paddingBottom: 6 }} title="Remove segment">
            <IconTrash size={13} />
          </Box>
        </Group>
      ))}

      <Group justify="space-between" pt={6} mt={6} style={{ borderTop: '1px solid #ebebeb' }}>
        <Text size="xs" fw={700}>Total Length</Text>
        <Text size="sm" fw={700}>{totalLength.toLocaleString('en-US')} ft</Text>
      </Group>

      {confirmModal}
    </Box>
  )
}

function NumField({ label, unit, value, onChange, onBlurCommit, helper }) {
  return (
    <Box mb={8}>
      <Text size="11px" c="dimmed">{label} ({unit})</Text>
      <TextInput size="xs" ta="right" value={value} onChange={(e) => onChange(e.currentTarget.value)} onBlur={onBlurCommit} />
      {helper && <Text size="10px" c="dimmed" fs="italic" mt={2}>{helper}</Text>}
    </Box>
  )
}

function DerivedRow({ label, unit }) {
  return (
    <Group justify="space-between" py={2}>
      <Text size="11px" c="dimmed">{label} <Text span size="9px" c="dimmed" tt="uppercase">(calculated)</Text></Text>
      <Text size="11px" c="dimmed" fw={600}>— {unit}</Text>
    </Group>
  )
}
