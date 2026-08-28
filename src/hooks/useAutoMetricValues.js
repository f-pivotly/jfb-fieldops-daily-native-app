import { useEffect, useState } from 'react'
import { executeDataView } from '../data'

function toISODate(d) {
  return d.toISOString().slice(0, 10)
}

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() - d.getDay())
  return toISODate(d)
}

function resultColumnFor(autoKind, metricSources) {
  return metricSources.find((m) => m.value === autoKind)?.result_column || null
}

export function useAutoMetricValues(rows, { projectId, endDate, totalStartDate, metricSources }) {
  const autoRows = rows
    .filter((r) => r.source === 'Auto')
    .map((r) => ({ ...r, column: resultColumnFor(r.autoKind, metricSources) }))
    .filter((r) => r.column)
  const signature = autoRows.map((r) => `${r.key}:${r.autoKind}:${r.column}:${r.equipmentId ?? ''}`).join(',')

  const [valuesByKey, setValuesByKey] = useState({})

  useEffect(() => {
    if (!projectId || !endDate || autoRows.length === 0) return
    let cancelled = false
    const weekStart = startOfWeek(endDate)

    autoRows.forEach(async (row) => {
      const params = (start, end) => ({
        p_project_id: projectId,
        p_start_date: start,
        p_end_date: end,
        p_equipment_id: row.equipmentId ?? null,
      })
      try {
        const [dayRes, weekRes, totalRes] = await Promise.all([
          executeDataView(row.autoKind, params(endDate, endDate)),
          executeDataView(row.autoKind, params(weekStart, endDate)),
          executeDataView(row.autoKind, params(totalStartDate, endDate)),
        ])
        if (cancelled) return
        const read = (res) => Number(res?.[0]?.[row.column] ?? 0)
        setValuesByKey((prev) => ({
          ...prev,
          [row.key]: { day: read(dayRes), week: read(weekRes), total: read(totalRes), error: null },
        }))
      } catch (err) {
        if (cancelled) return
        setValuesByKey((prev) => ({
          ...prev,
          [row.key]: { day: 0, week: 0, total: 0, error: err.message },
        }))
      }
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` is
  }, [signature, projectId, endDate, totalStartDate])

  return valuesByKey
}
