import { useEffect, useRef } from 'react'

const DEBOUNCE_MS = 2000

// Debounce-saves "activity" and "notes" together on the single per-report
// jfb_air_monitoring_daily row. Merges edits across both fields within one
// debounce window into a single create/update call, same idea as
// useReportSafetyForm.js.
export function useAirMonitoringDailyForm({ reportId, dailyRow, create, update }) {
  const timerRef = useRef(null)
  const pendingRef = useRef({})
  const rowIdRef = useRef(dailyRow?.id ?? null)
  const reportIdRef = useRef(reportId)

  useEffect(() => {
    if (dailyRow?.id) rowIdRef.current = dailyRow.id
  }, [dailyRow?.id])

  async function persistPending(targetReportId, targetRowId) {
    const patch = pendingRef.current
    pendingRef.current = {}
    if (!targetReportId || Object.keys(patch).length === 0) return
    if (targetRowId) {
      await update(targetRowId, patch)
    } else {
      const res = await create({ report_id: targetReportId, ...patch })
      const newId = res?.data?.id
      // Only adopt the new id if we're still on the report we created it
      // for -- a second report switch could have happened while the
      // create request was in flight.
      if (newId && reportIdRef.current === targetReportId) rowIdRef.current = newId
    }
  }

  function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    return persistPending(reportIdRef.current, rowIdRef.current)
  }

  // Flush any pending edit against the OLD report before switching state to
  // the new one, and reset rowIdRef so a subsequent save doesn't overwrite
  // the previous report's row. Without this, a PE who changes the report
  // date without leaving this tab -- Mantine's Tabs keepMounted only
  // unmounts on tab-switch, not date-switch, so the unmount-only flush
  // below never fires here -- could have their debounced edit silently
  // save against the previous date's jfb_air_monitoring_daily row instead
  // of creating one for the new date.
  useEffect(() => {
    if (reportIdRef.current === reportId) return
    const oldReportId = reportIdRef.current
    const oldRowId = rowIdRef.current
    if (Object.keys(pendingRef.current).length > 0) {
      void persistPending(oldReportId, oldRowId)
    }
    reportIdRef.current = reportId
    rowIdRef.current = dailyRow?.id ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      void persistPending(reportIdRef.current, rowIdRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onFieldChange(key, value) {
    pendingRef.current = { ...pendingRef.current, [key]: value }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void persistPending(reportIdRef.current, rowIdRef.current)
    }, DEBOUNCE_MS)
  }

  return { onFieldChange, flush }
}
