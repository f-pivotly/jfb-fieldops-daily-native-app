import { useEffect, useRef, useState } from 'react'
import { Box, Text, TextInput, Group, Button } from '@mantine/core'
import { IconTrash, IconPlus } from '@tabler/icons-react'
import { useHydraulicFlowStats } from '../hooks/useHydraulicFlowStats'
import { useHydraulicPipeConfigurations } from '../hooks/useHydraulicPipeConfigurations'
import { useConfirmDialog } from '../../../../hooks/useConfirmDialog'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import SafeError from '../../../../components/SafeError'

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

export function FlowStatsPanel({ projectId, equipmentId, reportDateISO, nohHours = 0 }) {
  const { flowStats, loading, error, create, update } = useHydraulicFlowStats(projectId)

  const todaysRow = flowStats.find(
    (r) => r.equipment_id === equipmentId && dateOnly(r.log_date) === reportDateISO,
  )
  const priorRow = flowStats
    .filter((r) => r.equipment_id === equipmentId && dateOnly(r.log_date) < reportDateISO && r.pipe_dia_inches != null)
    .sort((a, b) => (dateOnly(a.log_date) < dateOnly(b.log_date) ? 1 : -1))[0]

  const [edits, setEdits] = useState({})
  const [savedAt, setSavedAt] = useState(null)
  const lastEditedRef = useRef(null)

  const baseDiameter = formatNum(todaysRow ? todaysRow.pipe_dia_inches : priorRow?.pipe_dia_inches)
  const baseVelocity = formatNum(todaysRow?.avg_line_velocity)
  const baseFlowRate = formatNum(todaysRow?.avg_flow_rate)
  const baseDailyTotal = formatNum(todaysRow?.daily_total_gal)

  const diameter = 'diameter' in edits ? edits.diameter : baseDiameter
  const velocity = 'velocity' in edits ? edits.velocity : baseVelocity
  const flowRate = 'flowRate' in edits ? edits.flowRate : baseFlowRate
  // Daily Total Flow is derived, not typed: GPM x NOH x 60, matching the
  // non-native app. Stored rows that pre-date a rate entry still display.
  const autoDailyTotal = (() => {
    const gpm = parseNum(flowRate)
    if (gpm === null || gpm <= 0 || nohHours <= 0) return null
    return Math.round(gpm * nohHours * 60)
  })()
  const dailyTotal = autoDailyTotal !== null ? String(autoDailyTotal) : baseDailyTotal
  const carriedFrom = !todaysRow && !('diameter' in edits) && priorRow ? dateOnly(priorRow.log_date) : null

  // Project Total is this unit's whole flow history, every date, matching the
  // non-native app (fetchProjectFlowHistory has no date bound) so a report
  // opened mid-project shows the same figure its PDF prints.
  const projectTotalGal = flowStats
    .filter((r) => r.equipment_id === equipmentId)
    .reduce((a, r) => a + (Number(r.daily_total_gal) || 0), 0)
  const dailyTotalGal = parseNum(dailyTotal) ?? 0
  const previousTotalGal = Math.max(0, projectTotalGal - dailyTotalGal)

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
      daily_total_gal: autoDailyTotal ?? parseNum(dailyTotal),
    }
    const hasAnyValue = patch.pipe_dia_inches !== null || patch.avg_line_velocity !== null || patch.avg_flow_rate !== null || patch.daily_total_gal !== null
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

  // Keep the stored value in step with the derived one, the way the
  // non-native app re-saves it whenever GPM or NOH changes, so the PDF and the
  // project roll-up read the same number the panel shows.
  const storedDailyTotal = todaysRow ? Number(todaysRow.daily_total_gal ?? NaN) : null
  useEffect(() => {
    if (autoDailyTotal === null || !todaysRow) return
    if (storedDailyTotal === autoDailyTotal) return
    void update(todaysRow.id, { daily_total_gal: autoDailyTotal })
    // update() reloads the rows, which settles this comparison on the next pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDailyTotal, todaysRow?.id, storedDailyTotal])

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
          <NumField label="Avg Flow Rate" unit="GPM" value={flowRate} onChange={handleFlowRateChange} onBlurCommit={handleBlur}
            helper={parseNum(diameter) ? 'Edits here auto-calculate Line Velocity.' : undefined} />
          <DerivedRow
            label="Daily Total Flow" unit="GAL" value={dailyTotalGal}
            helper={autoDailyTotal !== null
              ? `GPM × NOH × 60 = ${formatNum(parseNum(flowRate))} × ${nohHours.toFixed(2)} h × 60`
              : undefined}
          />
          <DerivedRow label="Previous Total" unit="GAL" value={previousTotalGal} />
          <DerivedRow label="Project Total" unit="GAL" value={projectTotalGal} />
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
      <TextInput
        size="xs"
        ta="right"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onBlur={onBlurCommit}
        styles={{ input: { fontWeight: 600, color: '#111827' } }}
      />
      {helper && <Text size="10px" c="dimmed" fs="italic" mt={2}>{helper}</Text>}
    </Box>
  )
}

function DerivedRow({ label, unit, value, helper }) {
  return (
    <Box py={2}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="11px" c="dimmed">{label} <Text span size="9px" c="dimmed" tt="uppercase">(calculated)</Text></Text>
        <Text size="11px" fw={700} c="#111827">{value.toLocaleString('en-US')} {unit}</Text>
      </Group>
      {helper && <Text size="10px" c="dimmed" fs="italic">{helper}</Text>}
    </Box>
  )
}
