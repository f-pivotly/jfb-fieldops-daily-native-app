const US_TIME_ZONES = [
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Detroit', label: 'Eastern - Michigan (America/Detroit)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Phoenix', label: 'Mountain - Arizona, no DST (America/Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (America/Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Pacific/Honolulu)' },
]

function allTimeZones() {
  try {
    return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  } catch {
    return []
  }
}

export function isValidTimeZone(value) {
  if (!value) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function timeZoneOptions(current) {
  const usValues = new Set(US_TIME_ZONES.map((z) => z.value))
  const others = allTimeZones().filter((z) => !usValues.has(z)).map((z) => ({ value: z, label: z }))
  const known = usValues.has(current) || others.some((z) => z.value === current)
  const groups = [
    { group: 'United States', items: US_TIME_ZONES },
    { group: 'All time zones', items: others },
  ]
  if (current && !known) {
    groups.unshift({ group: 'Saved value', items: [{ value: current, label: isValidTimeZone(current) ? current : `${current} (not a valid time zone)` }] })
  }
  return groups.filter((g) => g.items.length > 0)
}
