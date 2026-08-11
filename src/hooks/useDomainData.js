import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDomainRecords, createDomainRecord, updateDomainRecord, deleteDomainRecord } from '../data'
import { useAppConfig } from '../contexts/appConfigContext'

export function useDomainData({ domain, system }) {
  const { config } = useAppConfig()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const cancelledRef = useRef(false)
  
  const load = useCallback(() => {
    if (!domain || !system) return Promise.resolve()
    if (!cancelledRef.current) setLoading(true)
    if (!cancelledRef.current) setError(null)
    return fetchDomainRecords({ domain, system, appSlug: config.appSlug })
      .then((res) => {
        if (!cancelledRef.current) setRecords(Array.isArray(res) ? res : (res?.data ?? []))
      })
      .catch((err) => {
        if (!cancelledRef.current) setError(err.message)
      })
      .finally(() => {
        if (!cancelledRef.current) setLoading(false)
      })
  }, [domain, system, config.appSlug])

  useEffect(() => {
    cancelledRef.current = false
    load()
    return () => { cancelledRef.current = true }
  }, [load])

  const create = useCallback(async (recordData) => {
    setCreating(true)
    try {
      await createDomainRecord({ domain, system, appSlug: config.appSlug, recordData })
      await load()
    } finally {
      setCreating(false)
    }
  }, [domain, system, config.appSlug, load])

  const update = useCallback(async (recordId, recordData) => {
    setUpdating(true)
    try {
      await updateDomainRecord({ domain, system, appSlug: config.appSlug, recordId, recordData })
      await load()
    } finally {
      setUpdating(false)
    }
  }, [domain, system, config.appSlug, load])

  const remove = useCallback(async (recordId) => {
    setDeleting(true)
    try {
      await deleteDomainRecord({ domain, system, appSlug: config.appSlug, recordId })
      await load()
    } finally {
      setDeleting(false)
    }
  }, [domain, system, config.appSlug, load])

  return { records, loading, error, creating, updating, deleting, reload: load, create, update, remove }
}
