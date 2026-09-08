import { useCallback, useState } from 'react'

// Shared "busy / success message / error" idiom -- the same manual
// saving/saveMsg/saveError-shaped triple hand-rolled independently across
// SafetyTab, DredgeChartTab (six separate instances), WeeklySummaryPage, and
// CappingSetupTab. `run` covers the common "wrap one async action" case;
// `markSuccess`/`markError` are exposed directly for call sites (like
// SafetyTab's shared save indicator) that report into one status from many
// different handlers rather than wrapping a single action.
//
// All returned functions are useCallback-stable (no deps -- they only touch
// state setters, which React guarantees are stable) so a caller can safely
// list markSuccess/markError/run/reset in another hook's dependency array
// without that effect re-firing every render.
export function useAsyncAction() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const run = useCallback(async (fn, { successMessage } = {}) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await fn()
      // A dynamic outcome (e.g. "Read 12,345 points...") is common once the
      // result is only known after the action completes -- fn can just
      // `return` that text instead of the caller needing a second call.
      // The successMessage option, when given, still wins.
      setMessage(successMessage ?? result ?? true)
      return result
    } catch (err) {
      setMessage(null)
      setError(err.message)
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])

  const markSuccess = useCallback((successMessage) => {
    setError(null)
    setMessage(successMessage ?? true)
  }, [])
  const markError = useCallback((errorMessage) => {
    setMessage(null)
    setError(errorMessage)
  }, [])
  const reset = useCallback(() => {
    setBusy(false)
    setMessage(null)
    setError(null)
  }, [])

  return { busy, message, error, run, markSuccess, markError, reset }
}
