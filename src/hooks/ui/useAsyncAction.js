import { useCallback, useState } from 'react'

const WARN_KEY = '__asyncWarning'

export function warn(text) {
  return { [WARN_KEY]: text }
}

export function useAsyncAction() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [warning, setWarning] = useState(null)
  const [error, setError] = useState(null)

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
