import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDomainRecords, createDomainRecord, updateDomainRecord, deleteDomainRecord } from '../data'
import { useAppConfig } from '../contexts/appConfigContext'

export function useDomainData({ domain, system, projectId, includeDeleted }) {
  const { config } = useAppConfig()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const generationRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(() => {
    if (!domain || !system) return Promise.resolve()
    const generation = ++generationRef.current
    const isCurrent = () => mountedRef.current && generationRef.current === generation
    if (isCurrent()) {
      setLoading(true)
      setError(null)
    }
    const filters = projectId ? { project_id: projectId } : undefined
    return fetchDomainRecords({ domain, system, appSlug: config.appSlug, filters, limit: 1000, includeDeleted })
      .then((res) => {
        if (isCurrent()) setRecords(Array.isArray(res) ? res : (res?.data ?? []))
      })
      .catch((err) => {
        if (isCurrent()) setError(err.message)
      })
      .finally(() => {
        if (isCurrent()) setLoading(false)
      })
  }, [domain, system, config.appSlug, projectId, includeDeleted])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback(async (recordData) => {
    setCreating(true)
    try {
      const res = await createDomainRecord({ domain, system, appSlug: config.appSlug, recordData })
      await load()
      return res
    } finally {
      setCreating(false)
    }
  }, [domain, system, config.appSlug, load])

  const update = useCallback(async (recordId, recordData, extraParameters) => {
    setUpdating(true)
    try {
      const res = await updateDomainRecord({ domain, system, appSlug: config.appSlug, recordId, recordData, extraParameters })
      await load()
      return res
    } finally {
      setUpdating(false)
    }
  }, [domain, system, config.appSlug, load])

  const remove = useCallback(async (recordId) => {
    setDeleting(true)
    try {
      const res = await deleteDomainRecord({ domain, system, appSlug: config.appSlug, recordId })
      await load()
      return res
    } finally {
      setDeleting(false)
    }
  }, [domain, system, config.appSlug, load])

  return { records, loading, error, creating, updating, deleting, reload: load, create, update, remove }
}
