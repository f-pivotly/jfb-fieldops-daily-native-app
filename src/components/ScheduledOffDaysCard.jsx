import { useState } from 'react'
import { Box, Text, Group, Button, TextInput, UnstyledButton } from '@mantine/core'
import { addDaysISO, daysBetween, prettyDate } from '../pages/FieldOps/lib/realizedToDate'

export default function ScheduledOffDaysCard({ projectId, excludedDays, today, onCreate, onRemove, onError }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('Scheduled time off')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState(null)

  async function handleAddRange() {
    if (!startDate) { setLocalError('Pick a start date.'); return }
    const end = endDate || startDate
    if (end < startDate) { setLocalError('End date must be on or after the start date.'); return }
    if (!reason.trim()) { setLocalError('Enter a reason.'); return }
    setLocalError(null)
    setBusy(true)
    try {
      const dates = []
      for (let d = startDate; d <= end; d = addDaysISO(d, 1)) dates.push(d)
      for (const date of dates) {
        await onCreate({ project_id: projectId, exclude_date: date, reason: reason.trim() })
      }
      setStartDate('')
      setEndDate('')
    } catch (e) {
      setLocalError(e.message)
      onError?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(date) {
    const row = excludedDays.find((d) => d.exclude_date === date)
    if (!row) return
    try {
      await onRemove(row.id)
    } catch (e) {
      onError?.(e.message)
    }
  }

  const future = excludedDays.filter((d) => d.exclude_date >= today).sort((a, b) => a.exclude_date.localeCompare(b.exclude_date))
  const past = excludedDays.filter((d) => d.exclude_date < today).sort((a, b) => b.exclude_date.localeCompare(a.exclude_date))

  return (
    <Box style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }} p={16}>
      <Text fw={700} size="sm" mb={4}>Scheduled Off-Days</Text>
      <Text size="xs" c="dimmed" mb={12}>
        Add days the project is closed (holidays, planned breaks). The Realized-to-Date forecast extends
        its goal-reach date by the count of future off-days in the projection window.
      </Text>

      <Group align="flex-end" gap={8} mb={4}>
        <TextInput
          size="xs" label="Start date" type="date" value={startDate}
          onChange={(e) => {
            const v = e.currentTarget.value
            setStartDate(v)
            if (endDate && v && endDate < v) setEndDate(v)
          }}
        />
        <TextInput size="xs" label="End date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.currentTarget.value)} />
        <TextInput size="xs" label="Reason" placeholder="e.g. July 4 holiday week" value={reason} onChange={(e) => setReason(e.currentTarget.value)} style={{ flex: 1, minWidth: 160 }} />
        <Button size="xs" loading={busy} disabled={!startDate} onClick={handleAddRange} style={{ background: '#0F2744', border: 'none' }}>Add</Button>
      </Group>
      {endDate && startDate && endDate !== startDate && (
        <Text size="10px" c="dimmed" mb={8}>
          Will add {Math.max(1, daysBetween(startDate, endDate) + 1)} entries — one per calendar day from {prettyDate(startDate)} to {prettyDate(endDate)}.
        </Text>
      )}
      {localError && <Text size="10px" c="red" mb={8}>{localError}</Text>}

      {future.length > 0 && (
        <Box mt={12}>
          <Text size="10px" fw={700} tt="uppercase" c="dimmed" mb={4}>Upcoming ({future.length})</Text>
          <DayList items={future} onRemove={handleRemove} highlight />
        </Box>
      )}
      {past.length > 0 && (
        <Box mt={12}>
          <Text size="10px" fw={700} tt="uppercase" c="dimmed" mb={4}>Past ({past.length})</Text>
          <DayList items={past} onRemove={handleRemove} />
        </Box>
      )}
      {excludedDays.length === 0 && <Text size="10px" c="dimmed" fs="italic" mt={8}>No off-days scheduled yet.</Text>}
    </Box>
  )
}

function DayList({ items, onRemove, highlight }) {
  return (
    <Box style={{ border: `1px solid ${highlight ? '#fde68a' : 'var(--mantine-color-gray-3)'}`, borderRadius: 6, background: highlight ? '#fffbeb' : undefined }}>
      {items.map((d, i) => (
        <Group key={d.exclude_date} justify="space-between" px={8} py={4} style={{ borderBottom: i < items.length - 1 ? '1px solid var(--mantine-color-gray-1)' : 'none' }}>
          <Group gap={8}>
            <Text size="xs" fw={600}>{prettyDate(d.exclude_date)}</Text>
            <Text size="xs" c="dimmed">{d.reason}</Text>
          </Group>
          <UnstyledButton onClick={() => onRemove(d.exclude_date)} title="Remove">
            <Text size="xs" c="dimmed">×</Text>
          </UnstyledButton>
        </Group>
      ))}
    </Box>
  )
}
