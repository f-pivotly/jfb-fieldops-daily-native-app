import { useEffect, useMemo, useRef, useState } from 'react'
import { metricValueKey } from '../../lib/metricValueKey'

const DEBOUNCE_MS = 2000

function toISODate(d) {
  return d.toISOString().slice(0, 10)
}

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() - d.getDay())
  return toISODate(d)
}

export function useManualMetricValues({ project, report, reports, metrics, reportMetricValues, create, update, reload }) {
  const [drafts, setDrafts] = useState({})
  const timersRef = useRef(new Map())
  const pendingRef = useRef(new Map())

  const reportDateById = useMemo(
    () => Object.fromEntries(reports.map((r) => [r.id, r.report_date])),
    [reports],
  )
  const metricKeyById = useMemo(
    () => Object.fromEntries((metrics ?? []).map((m) => [m.id, m.metric_key])),
    [metrics],
  )
  const latestRef = useRef({ report, reportMetricValues, metricKeyById })
  useEffect(() => {
    latestRef.current = { report, reportMetricValues, metricKeyById }
  })

  const endDate = report?.report_date
  const weekStart = endDate ? startOfWeek(endDate) : null
  const totalStartDate = project?.start_date ? project.start_date.slice(0, 10) : '1900-01-01'

  async function persist(metricKey, metricId, value) {
    const { report: currentReport, reportMetricValues: values, metricKeyById: keyById } = latestRef.current
    if (!currentReport?.id || !metricKey) return
    const existing = values.find(
      (v) => v.report_id === currentReport.id && metricValueKey(v, keyById) === metricKey,
    )
    if (existing) {
      await update(existing.id, { value, metric_key: metricKey, metric_id: metricId })
    } else {
      await create({ report_id: currentReport.id, metric_id: metricId, metric_key: metricKey, value })
    }
    await reload()
  }

  function flush(metricKey) {
    const timer = timersRef.current.get(metricKey)
    if (!timer) return
    clearTimeout(timer)
    timersRef.current.delete(metricKey)
    const entry = pendingRef.current.get(metricKey)
    pendingRef.current.delete(metricKey)
    if (entry) void persist(metricKey, entry.metricId, entry.value)
  }

  useEffect(() => {
    return () => {
      const pending = new Map(pendingRef.current)
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current.clear()
      pendingRef.current.clear()
      pending.forEach((entry, metricKey) => { void persist(metricKey, entry.metricId, entry.value) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onManualChange(metricKey, metricId, raw) {
    setDrafts((prev) => ({ ...prev, [metricKey]: raw }))
    const trimmed = raw.trim()
    const num = trimmed === '' ? null : Number(trimmed)
    const value = Number.isFinite(num) ? num : null

    const existingTimer = timersRef.current.get(metricKey)
    if (existingTimer) clearTimeout(existingTimer)
    pendingRef.current.set(metricKey, { metricId, value })
    const t = setTimeout(() => {
      timersRef.current.delete(metricKey)
      const entry = pendingRef.current.get(metricKey)
      pendingRef.current.delete(metricKey)
      if (entry) void persist(metricKey, entry.metricId, entry.value)
    }, DEBOUNCE_MS)
    timersRef.current.set(metricKey, t)
  }

  function valuesFor(metricKey) {
    if (!endDate || !metricKey) return { day: null, week: 0, total: 0 }
    let day = null, week = 0, total = 0
    for (const v of reportMetricValues) {
      if (metricValueKey(v, metricKeyById) !== metricKey) continue
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
