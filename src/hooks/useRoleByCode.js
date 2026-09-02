import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRoleByCode } from '../data'

// Resolves a Pivotly role's current id from its stable `code` (e.g.
// "jfb_project_engineers"), so callers never hardcode a role's uuid — those
// are per-environment and change if a role is ever deleted and recreated.
// enabled=false skips the fetch entirely (e.g. caller lacks the role.list claim).
export function useRoleByCode(code, { enabled = true } = {}) {
  const [roleId, setRoleId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(() => {
    if (!code || !enabled) {
      if (mountedRef.current) setLoading(false)
      return Promise.resolve()
    }
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }
    return fetchRoleByCode(code)
      .then((role) => {
        if (mountedRef.current) setRoleId(role?.id ?? null)
      })
      .catch((err) => {
        if (mountedRef.current) setError(err.message)
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false)
      })
  }, [code, enabled])

  useEffect(() => {
    load()
  }, [load])

  return { roleId, loading, error, reload: load }
}
