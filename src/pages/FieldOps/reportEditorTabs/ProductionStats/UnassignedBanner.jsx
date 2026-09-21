import { List, Text } from '@mantine/core'
import WarningBanner, { WARNING_TEXT } from '../components/WarningBanner'
import { hoursBetween } from '../../lib/eventTotals'
import { hhmm } from '../../../../lib/reportDates'

export default function UnassignedBanner({ activities }) {
  const untagged = (activities ?? []).filter((a) => !a.area?.area_id)
  const hours = untagged.reduce((sum, a) => sum + hoursBetween(a.start_date_time, a.end_date_time), 0)
  if (untagged.length === 0 || hours <= 0.001) return null

  const sorted = [...untagged].sort((a, b) => Date.parse(a.start_date_time) - Date.parse(b.start_date_time))

  return (
    <WarningBanner p={10} mb={10}>
      <Text size="xs" fw={600} c={WARNING_TEXT}>
        {hours.toFixed(2)} h of shift time isn&apos;t attributed to an Area yet
      </Text>
      <Text size="xs" c={WARNING_TEXT}>
        Those hours show as an <strong>Unassigned</strong> row below and count in the totals, so they
        reconcile to the event log — but they can&apos;t be credited to an area until the events carry
        one. Set the area on those events in the Event Log.
      </Text>
      <List size="xs" c={WARNING_TEXT} withPadding mt={4}>
        {sorted.map((a) => (
          <List.Item key={a.id}>
            {hhmm(a.start_date_time)} – {hhmm(a.end_date_time)} · {a.category} ·{' '}
            {hoursBetween(a.start_date_time, a.end_date_time).toFixed(2)} h
          </List.Item>
        ))}
      </List>
    </WarningBanner>
  )
}
