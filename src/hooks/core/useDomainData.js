import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDomainRecords, fetchAllDomainRecords, createDomainRecord, updateDomainRecord, deleteDomainRecord } from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'
import { FETCH_PAGE_SIZE } from '../../constants/pagination'


export function useDomainData(options) {
  const { domain, system, projectId, reportId, includeDeleted, limit = 500, fetchAll = true, paginate = false, sortCol, sortDir, filters: extraFilters } = options

  const extraFiltersKey = JSON.stringify(extraFilters ?? null)

  const scopeMissing = ('projectId' in options || 'reportId' in options) && !projectId && !reportId
  const { config } = useAppConfig()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [total, setTotal] = useState(null)
  const [pageLoading, setPageLoading] = useState(false)
  const pagedLoadedRef = useRef(false)
  const scopeKey = `${domain}|${projectId ?? ''}|${reportId ?? ''}|${extraFiltersKey}`
  const [pageState, setPageState] = useState({ key: scopeKey, page: 1 })
  const page = pageState.key === scopeKey ? pageState.page : 1
  const setPage = useCallback((next) => setPageState({ key: scopeKey, page: next }), [scopeKey])
  const generationRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

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
    const quietPageChange = paginate && pagedLoadedRef.current
    if (isCurrent()) {
      if (quietPageChange) setPageLoading(true)
      else setLoading(true)
      setError(null)
    }
    const scoped = JSON.parse(extraFiltersKey) ?? {}
    if (projectId) scoped.project_id = projectId
    else if (reportId) scoped.report_id = reportId
    const filters = Object.keys(scoped).length ? scoped : undefined
    if (paginate) {
      return fetchDomainRecords({
        domain, system, appSlug: config.appSlug, filters, sortCol, sortDir, includeDeleted,
        limit: FETCH_PAGE_SIZE, offset: (page - 1) * FETCH_PAGE_SIZE,
        countMode: 'exact', forceMeta: true, paged: true,
      })
        .then((res) => {
          if (!isCurrent()) return
          const rows = res?.data ?? []
          if (!rows.length && page > 1) {
            setPage(page - 1)
            return
          }
          pagedLoadedRef.current = true
          setRecords(rows)
          setTotal(res?.meta?.total_records ?? null)
        })
        .catch((err) => {
          if (isCurrent()) setError(err.message)
        })
        .finally(() => {
          if (isCurrent()) {
            setLoading(false)
            setPageLoading(false)
          }
        })
    }
    const request = fetchAll
      ? fetchAllDomainRecords({ domain, system, appSlug: config.appSlug, filters, sortCol, sortDir, includeDeleted })
      : fetchDomainRecords({ domain, system, appSlug: config.appSlug, filters, sortCol, sortDir, limit, includeDeleted })

    return request
      .then((res) => {
        if (isCurrent()) setRecords(Array.isArray(res) ? res : (res?.data ?? []))
      })
      .catch((err) => {
        if (isCurrent()) setError(err.message)
      })
      .finally(() => {
        if (isCurrent()) setLoading(false)
      })
  }, [domain, system, config.appSlug, projectId, reportId, includeDeleted, limit, fetchAll, paginate, page, setPage, sortCol, sortDir, scopeMissing, extraFiltersKey])

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

  return { records, loading, error, creating, updating, deleting, reload: load, create, update, remove, page, setPage, total, pageLoading, pageSize: FETCH_PAGE_SIZE }
}
