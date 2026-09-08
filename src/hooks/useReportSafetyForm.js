import { useEffect, useRef } from 'react'

const DEBOUNCE_MS = 2000

// Debounce-saves flat fields on the single per-report jfb_report_safety_v2 row,
// creating it on the first save if it doesn't exist yet. All fields changed
// within one debounce window are merged into one create/update call, which
// keeps a burst of edits across several fields (all sharing the same row)
// from racing each other into duplicate creates. Mirrors the 2s-after-
// keystroke, flush-on-blur/unmount pattern in useManualMetricValues.js.
export function useReportSafetyForm({ reportId, reportSafety, create, update }) {
  const timerRef = useRef(null)
  const pendingRef = useRef({})
  const rowIdRef = useRef(reportSafety?.id ?? null)
  useEffect(() => {
    if (reportSafety?.id) rowIdRef.current = reportSafety.id
  }, [reportSafety?.id])

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

  // Returns the in-flight save promise so callers can react to
  // completion/failure (e.g. a shared "Saved ✓" indicator) -- existing
  // fire-and-forget callers are unaffected since they simply don't await it.
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

  function saveImmediate(key, value) {
    pendingRef.current = { ...pendingRef.current, [key]: value }
    return flush()
  }

  // Resolves the row id, creating an empty row first if none exists yet --
  // for callers (like a signature upload) that need a coreRecordId to
  // attach to before any text field has triggered a save of its own.
  async function ensureRow() {
    if (!reportId) return null
    if (rowIdRef.current) return rowIdRef.current
    const res = await create({ report_id: reportId })
    const newId = res?.data?.id
    if (newId) rowIdRef.current = newId
    return rowIdRef.current
  }

  return { onFieldChange, flush, saveImmediate, ensureRow }
}
