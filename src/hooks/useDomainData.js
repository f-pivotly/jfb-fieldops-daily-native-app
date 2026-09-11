import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDomainRecords, createDomainRecord, updateDomainRecord, deleteDomainRecord } from '../data'
import { useAppConfig } from '../contexts/appConfigContext'


export function useDomainData(options) {
  const { domain, system, projectId, reportId, includeDeleted, limit = 500, filters: extraFilters } = options

  const extraFiltersKey = JSON.stringify(extraFilters ?? null)

  const scopeMissing = ('projectId' in options || 'reportId' in options) && !projectId && !reportId
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
    if (scopeMissing) {
      if (isCurrent()) {
        setRecords([])
        setError(null)
      }
      return Promise.resolve()
    }
    if (isCurrent()) {
      setLoading(true)
      setError(null)
    }
    const scoped = JSON.parse(extraFiltersKey) ?? {}
    if (projectId) scoped.project_id = projectId
    else if (reportId) scoped.report_id = reportId
    const filters = Object.keys(scoped).length ? scoped : undefined
    return fetchDomainRecords({ domain, system, appSlug: config.appSlug, filters, limit, includeDeleted })
      .then((res) => {
        if (isCurrent()) setRecords(Array.isArray(res) ? res : (res?.data ?? []))
      })
      .catch((err) => {
        if (isCurrent()) setError(err.message)
      })
      .finally(() => {
        if (isCurrent()) setLoading(false)
      })
  }, [domain, system, config.appSlug, projectId, reportId, includeDeleted, limit, scopeMissing, extraFiltersKey])

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
