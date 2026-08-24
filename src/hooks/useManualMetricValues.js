import { useEffect, useMemo, useRef, useState } from 'react'

const DEBOUNCE_MS = 2000

function toISODate(d) {
  return d.toISOString().slice(0, 10)
}

// Confirmed against the old (non-native) app's own code comment
// (src/components/MetricsTab.tsx: "Week resets each Sunday") -- not a native
// app guess, matches real precedent.
function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() - d.getDay())
  return toISODate(d)
}

// Mirrors the old app's manual-metric save behavior exactly: typing updates
// a local draft immediately (so the input feels instant), then debounce-saves
// 2 seconds after the last keystroke. Blur or unmount flushes immediately
// instead of waiting, so switching tabs mid-type doesn't drop the value.
// Only works for rows with a real metricId (i.e. already saved via "Save
// metrics") -- there's nowhere to attach a value until the metric itself is
// a real jfb_metrics row.
export function useManualMetricValues({ project, report, reports, reportMetricValues, create, update, reload }) {
  const [drafts, setDrafts] = useState({})
  const timersRef = useRef(new Map())
  const pendingRef = useRef(new Map())

  const reportDateById = useMemo(
    () => Object.fromEntries(reports.map((r) => [r.id, r.report_date])),
    [reports],
  )
  const endDate = report?.report_date
  const weekStart = endDate ? startOfWeek(endDate) : null
  const totalStartDate = project?.start_date ? project.start_date.slice(0, 10) : '1900-01-01'

  async function persist(metricId, value) {
    if (!report?.id) return
    const existing = reportMetricValues.find((v) => v.report_id === report.id && v.metric_id === metricId)
    if (existing) {
      await update(existing.id, { value })
    } else {
      await create({ report_id: report.id, metric_id: metricId, value })
    }
    await reload()
  }

  function flush(metricId) {
    const timer = timersRef.current.get(metricId)
    if (!timer) return
    clearTimeout(timer)
    timersRef.current.delete(metricId)
    const entry = pendingRef.current.get(metricId)
    pendingRef.current.delete(metricId)
    if (entry) void persist(metricId, entry.value)
  }

  useEffect(() => {
    return () => {
      // Flush every still-pending edit on unmount, same as the old app.
      const pending = new Map(pendingRef.current)
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current.clear()
      pendingRef.current.clear()
      pending.forEach((entry, metricId) => { void persist(metricId, entry.value) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    // unmount-only flush; re-running this on every dependency change would
    // fire it constantly instead of just at teardown.
  }, [])

  function onManualChange(metricId, raw) {
    setDrafts((prev) => ({ ...prev, [metricId]: raw }))
    const trimmed = raw.trim()
    const num = trimmed === '' ? null : Number(trimmed)
    const value = Number.isFinite(num) ? num : null

    const existingTimer = timersRef.current.get(metricId)
    if (existingTimer) clearTimeout(existingTimer)
    pendingRef.current.set(metricId, { value })
    const t = setTimeout(() => {
      timersRef.current.delete(metricId)
      const entry = pendingRef.current.get(metricId)
      pendingRef.current.delete(metricId)
      if (entry) void persist(metricId, entry.value)
    }, DEBOUNCE_MS)
    timersRef.current.set(metricId, t)
  }

  // Day is a direct lookup (whatever was typed for this exact report); Week/
  // Total are sums across every report in range -- not stored duplicates
  // (METRICS_MIGRATION_PLAN.md §4 open question 3).
  function valuesFor(metricId) {
    if (!endDate) return { day: null, week: 0, total: 0 }
    let day = null, week = 0, total = 0
    for (const v of reportMetricValues) {
      if (v.metric_id !== metricId) continue
      const date = reportDateById[v.report_id]
      if (!date) continue
      const num = Number(v.value)
      if (!Number.isFinite(num)) continue
      if (v.report_id === report.id) day = num
      if (date >= totalStartDate && date <= endDate) {
        total += num
        if (weekStart && date >= weekStart) week += num
      }
    }
    return { day, week, total }
  }

  return { drafts, onManualChange, flush, valuesFor }
}
