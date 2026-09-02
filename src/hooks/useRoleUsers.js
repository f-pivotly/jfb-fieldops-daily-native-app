import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRoleUsers } from '../data'

// Lists users assigned to a given Pivotly role (Admin → Roles → Users tab).
// enabled=false skips the fetch entirely, e.g. when the caller lacks the
// user_role.list claim and the request would just 403.
export function useRoleUsers(roleId, { enabled = true } = {}) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(() => {
    if (!roleId || !enabled) {
      if (mountedRef.current) setLoading(false)
      return Promise.resolve()
    }
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }
    return fetchRoleUsers(roleId)
      .then((res) => {
        if (mountedRef.current) setUsers(Array.isArray(res) ? res : (res?.data ?? []))
      })
      .catch((err) => {
        if (mountedRef.current) setError(err.message)
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false)
      })
  }, [roleId, enabled])

  useEffect(() => {
    load()
  }, [load])

  return { users, loading, error, reload: load }
}
