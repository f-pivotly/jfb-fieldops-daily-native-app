import { useEffect, useState } from 'react'
import { executeDataView } from '../data'

function toISODate(d) {
  return d.toISOString().slice(0, 10)
}

// Week = Sunday through the report date, inclusive. No product decision has
// pinned down a report/fiscal week start yet (METRICS_MIGRATION_PLAN.md §4) —
// Sunday is a placeholder convention, not a confirmed business rule.
function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() - d.getDay())
  return toISODate(d)
}

// Which column to read off a data view's response is stored on the
// jfb_metric_sources row itself (result_column) rather than hardcoded here —
// so adding a new auto source is just a new domain row, no app deploy.
function resultColumnFor(autoKind, metricSources) {
  return metricSources.find((m) => m.value === autoKind)?.result_column || null
}

// Auto metrics recompute live every call and are never persisted — deliberate
// (METRICS_MIGRATION_PLAN.md §1: a stale saved auto-value once shipped a PDF
// wrong by 554 CY). Each auto row fires 3 data-view calls (Day/Week/Total
// ranges) rather than caching or storing anything. Returns { [rowKey]: {day,
// week, total, error} } for rows whose source resolves to a known
// jfb_metric_sources.result_column.
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
        // The metric row's own equipment_id (jfb_metrics.equipment_id), set
        // via the "Manage metrics" Equipment dropdown -- null means "all
        // equipment" (sums every unit). Deliberately not the report editor's
        // sidebar equipment selector: that scopes the Event Log/Production
        // Stats tabs to one unit, a different, unrelated concept.
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
    // the intentional dependency; the full `rows` array gets a new reference
    // on every keystroke in the Manage Metrics dialog (label/unit edits,
    // etc.), which shouldn't refire these fetches.
  }, [signature, projectId, endDate, totalStartDate])

  return valuesByKey
}
