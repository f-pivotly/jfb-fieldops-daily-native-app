import { useCallback, useState } from 'react'

const WARN_KEY = '__asyncWarning'

/** Wrap a message so `run` reports it as a WARNING rather than a success. */
export function warn(text) {
  return { [WARN_KEY]: text }
}

export function useAsyncAction() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [warning, setWarning] = useState(null)
  const [error, setError] = useState(null)

  // An action can finish three ways, not two. A save whose record went through
  // but whose files did not is neither a success nor a failure, and saying
  // either one misleads: green hides that a file is missing, red implies
  // nothing was written. `fn` returns WARN(text) for that middle case.
  const run = useCallback(async (fn, { successMessage } = {}) => {
    setBusy(true)
    setError(null)
    setWarning(null)
    setMessage(null)
    try {
      const result = await fn()
      if (result && typeof result === 'object' && result[WARN_KEY]) {
        setWarning(result[WARN_KEY])
        return result
      }
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
    setWarning(null)
    setMessage(successMessage ?? true)
  }, [])
  const markError = useCallback((errorMessage) => {
    setMessage(null)
    setWarning(null)
    setError(errorMessage)
  }, [])
  const reset = useCallback(() => {
    setBusy(false)
    setMessage(null)
    setWarning(null)
    setError(null)
  }, [])

  return { busy, message, warning, error, run, markSuccess, markError, reset }
}
