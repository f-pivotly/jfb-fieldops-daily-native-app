import { useEffect, useRef, useState } from 'react'
import { Box, Text, Group, Button, TextInput, UnstyledButton } from '@mantine/core'
import { addDaysISO, daysBetween, prettyDate } from '../pages/FieldOps/lib/realizedToDate'
import PaginationBar from './PaginationBar'
import { useDomainData } from '../hooks/core/useDomainData'
import { saveExcludedDays } from '../hooks/project/useRealizedExcludedDays'
import { useAppConfig } from '../contexts/appConfigContext'

const DOMAIN = 'jfb_realized_excluded_days'

export default function ScheduledOffDaysCard({ projectId, today, refreshKey, onChanged, onError }) {
  const { config } = useAppConfig()
  const future = useDomainData({
    domain: DOMAIN, system: 'core', projectId, filters: { exclude_date: { gte: today } },
    paginate: true, sortCol: 'exclude_date', sortDir: 'asc',
  })
  const past = useDomainData({
    domain: DOMAIN, system: 'core', projectId, filters: { exclude_date: { lt: today } },
    paginate: true, sortCol: 'exclude_date', sortDir: 'desc',
  })
  const reloadFuture = future.reload
  const reloadPast = past.reload
  const lastRefreshKey = useRef(refreshKey)

  useEffect(() => {
    if (lastRefreshKey.current === refreshKey) return
    lastRefreshKey.current = refreshKey
    reloadFuture()
    reloadPast()
  }, [refreshKey, reloadFuture, reloadPast])

  async function afterChange() {
    await Promise.all([reloadFuture(), reloadPast()])
    await onChanged?.()
  }
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
      await saveExcludedDays({ appSlug: config.appSlug, projectId, dates, reason: reason.trim() })
      await afterChange()
      setStartDate('')
      setEndDate('')
    } catch (e) {
      setLocalError(e.message)
      onError?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(list, id) {
    try {
      await list.remove(id)
      await afterChange()
    } catch (e) {
      onError?.(e.message)
    }
  }

  const hasFuture = future.records.length > 0 || future.page > 1
  const hasPast = past.records.length > 0 || past.page > 1

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

      {hasFuture && (
        <Box mt={12}>
          <Text size="10px" fw={700} tt="uppercase" c="dimmed" mb={4}>Upcoming{future.total != null ? ` (${future.total})` : ''}</Text>
          <DayList list={future} onRemove={(id) => handleRemove(future, id)} highlight />
        </Box>
      )}
      {hasPast && (
        <Box mt={12}>
          <Text size="10px" fw={700} tt="uppercase" c="dimmed" mb={4}>Past{past.total != null ? ` (${past.total})` : ''}</Text>
          <DayList list={past} onRemove={(id) => handleRemove(past, id)} />
        </Box>
      )}
      {!future.loading && !past.loading && !hasFuture && !hasPast && <Text size="10px" c="dimmed" fs="italic" mt={8}>No off-days scheduled yet.</Text>}
    </Box>
  )
}

function DayList({ list, onRemove, highlight }) {
  const { records: pageRows, page, setPage, total, hasNext, pageLoading, pageSize } = list
  return (
    <>
    <Box style={{ border: `1px solid ${highlight ? '#fde68a' : 'var(--mantine-color-gray-3)'}`, borderRadius: 6, background: highlight ? '#fffbeb' : undefined, opacity: pageLoading ? 0.5 : 1 }}>
      {pageRows.map((d, i) => (
        <Group key={d.id} justify="space-between" px={8} py={4} style={{ borderBottom: i < pageRows.length - 1 ? '1px solid var(--mantine-color-gray-1)' : 'none' }}>
          <Group gap={8}>
            <Text size="xs" fw={600}>{prettyDate(d.exclude_date)}</Text>
            <Text size="xs" c="dimmed">{d.reason}</Text>
          </Group>
          <UnstyledButton onClick={() => onRemove(d.id)} title="Remove">
            <Text size="xs" c="dimmed">×</Text>
          </UnstyledButton>
        </Group>
      ))}
    </Box>
    <PaginationBar page={page} pageSize={pageSize} count={pageRows.length} total={total} hasNext={hasNext} onChange={setPage} disabled={pageLoading} noun="day" mt={8} />
    </>
  )
}
