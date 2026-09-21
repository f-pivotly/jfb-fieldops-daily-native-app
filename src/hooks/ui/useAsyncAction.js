import { useCallback, useState } from 'react'

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
