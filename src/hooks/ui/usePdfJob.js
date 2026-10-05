import { useCallback, useEffect, useRef, useState } from 'react'

function pdfErrorMessage(err) {
  const text = String(err?.message || '')
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(text)) {
    return 'The PDF took too long to generate. Try again in a moment; reports with many photos or charts take longest.'
  }
  const serverMessage = err?.response?.data?.message || err?.response?.data?.error
  return String(serverMessage || text || 'The PDF could not be generated.')
}

export function usePdfJob() {
  const inFlightRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!busy) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [busy])

  const run = useCallback(async (fn) => {
    if (inFlightRef.current) return undefined
    inFlightRef.current = true
    const started = Date.now()
    setStartedAt(started)
    setNow(started)
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (err) {
      setError(pdfErrorMessage(err))
      return undefined
    } finally {
      inFlightRef.current = false
      setBusy(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])
  const elapsedSeconds = busy ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0

  return { busy, error, elapsedSeconds, run, clearError }
}
