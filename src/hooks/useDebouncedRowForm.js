import { useEffect, useRef } from 'react'
import { readWrittenRecordId } from '../data'

const DEBOUNCE_MS = 2000

export function useDebouncedRowForm({ projectId, reportId, row, create, update }) {
  const timerRef = useRef(null)
  const pendingRef = useRef({})
  const rowIdRef = useRef(row?.id ?? null)
  const reportIdRef = useRef(reportId)

  useEffect(() => {
    if (row?.id) rowIdRef.current = row.id
  }, [row?.id])

  async function persistPending(targetReportId, targetRowId) {
    const patch = pendingRef.current
    pendingRef.current = {}
    if (!targetReportId || Object.keys(patch).length === 0) return
    if (targetRowId) {
      await update(targetRowId, patch)
    } else {
      const res = await create({
        ...(projectId ? { project_id: projectId } : {}),
        report_id: targetReportId,
        ...patch,
      })
      const newId = readWrittenRecordId(res)
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

  useEffect(() => {
    if (reportIdRef.current === reportId) return
    const oldReportId = reportIdRef.current
    const oldRowId = rowIdRef.current
    if (Object.keys(pendingRef.current).length > 0) {
      void persistPending(oldReportId, oldRowId)
    }
    reportIdRef.current = reportId
    rowIdRef.current = row?.id ?? null
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

  function saveImmediate(key, value) {
    pendingRef.current = { ...pendingRef.current, [key]: value }
    return flush()
  }

  async function ensureRow() {
    if (!reportIdRef.current) return null
    if (rowIdRef.current) return rowIdRef.current
    const res = await create({
      ...(projectId ? { project_id: projectId } : {}),
      report_id: reportIdRef.current,
    })
    const newId = readWrittenRecordId(res)
    if (newId) rowIdRef.current = newId
    return rowIdRef.current
  }

  return { onFieldChange, flush, saveImmediate, ensureRow }
}
