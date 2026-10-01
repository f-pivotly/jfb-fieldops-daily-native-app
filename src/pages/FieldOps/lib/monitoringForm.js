export const PRIMARY_BUTTON = { background: '#0F2744', border: 'none' }
export const DEFAULT_TIMEZONE = 'America/New_York'
export const DIGITS = /^\d+$/

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles']
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const textOf = (v) => (v === null || v === undefined ? '' : String(v))
export const toHhmm = (v, fallback) => (typeof v === 'string' && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : fallback)

export function timezoneOptions(current) {
  return current && !TIMEZONES.includes(current) ? [current, ...TIMEZONES] : TIMEZONES
}

export function thresholdDrafts(fields, thresholds) {
  return Object.fromEntries(fields.map((f) => [f.key, textOf(thresholds?.[f.key])]))
}

export function buildThresholds(fields, drafts, existing, dropKeys = []) {
  const next = { ...(existing && typeof existing === 'object' ? existing : {}) }
  for (const key of dropKeys) delete next[key]
  for (const f of fields) {
    const text = String(drafts[f.key] ?? '').trim()
    if (text === '') {
      delete next[f.key]
      continue
    }
    const n = Number(text)
    if (!Number.isFinite(n)) return { error: `${f.label} must be a number.` }
    next[f.key] = n
  }
  return { value: next }
}

export function checkSchedule(form) {
  if (!TIME_PATTERN.test(form.window_start) || !TIME_PATTERN.test(form.window_end)) return 'Enter the report window as HH:MM.'
  if (form.window_start >= form.window_end) return 'Report window end must be after the start.'
  const interval = Number(form.interval_minutes)
  if (!Number.isInteger(interval) || interval < 1 || interval > 1440) return 'Interval must be a whole number of minutes (1-1440).'
  return null
}

export function scheduleFields(form) {
  return {
    timezone: form.timezone,
    window_start: `${form.window_start}:00`,
    window_end: `${form.window_end}:00`,
    interval_minutes: Number(form.interval_minutes),
  }
}

export function formatReadingTime(iso, timeZone) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return textOf(iso)
  const opts = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).format(d)
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(d)
  }
}
