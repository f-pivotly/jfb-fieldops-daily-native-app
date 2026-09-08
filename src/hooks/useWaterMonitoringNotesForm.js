import { useEffect, useRef } from 'react'

const DEBOUNCE_MS = 2000

// Debounce-saves fields on the single per-report jfb_water_monitoring_notes
// row, creating it on the first save if it doesn't exist yet. Mirrors
// useReportSafetyForm.js's shape exactly (same 2s-after-keystroke,
// flush-on-blur/unmount pattern).
export function useWaterMonitoringNotesForm({ reportId, notesRow, create, update }) {
  const timerRef = useRef(null)
  const pendingRef = useRef({})
  const rowIdRef = useRef(notesRow?.id ?? null)
  useEffect(() => {
    if (notesRow?.id) rowIdRef.current = notesRow.id
  }, [notesRow?.id])

  async function persistPending() {
    const patch = pendingRef.current
    pendingRef.current = {}
    if (!reportId || Object.keys(patch).length === 0) return
    if (rowIdRef.current) {
      await update(rowIdRef.current, patch)
    } else {
      const res = await create({ report_id: reportId, ...patch })
      const newId = res?.data?.id
      if (newId) rowIdRef.current = newId
    }
  }

  function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    return persistPending()
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      void persistPending()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onFieldChange(key, value) {
    pendingRef.current = { ...pendingRef.current, [key]: value }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void persistPending()
    }, DEBOUNCE_MS)
  }

  return { onFieldChange, flush }
}
