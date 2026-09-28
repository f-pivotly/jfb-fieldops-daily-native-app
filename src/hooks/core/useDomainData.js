import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDomainRecords, fetchAllDomainRecords, createDomainRecord, updateDomainRecord, deleteDomainRecord } from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'
import { FETCH_PAGE_SIZE } from '../../constants/pagination'


export function useDomainData(options) {
  const { domain, system, projectId, reportId, includeDeleted, limit = 500, fetchAll = true, loadMore: incremental = false, sortCol, sortDir, filters: extraFilters } = options

  const extraFiltersKey = JSON.stringify(extraFilters ?? null)

  const scopeMissing = ('projectId' in options || 'reportId' in options) && !projectId && !reportId
  const { config } = useAppConfig()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const shownRef = useRef(FETCH_PAGE_SIZE)
  const recordsRef = useRef([])
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
    if (isCurrent()) {
      setLoading(true)
      setError(null)
    }
    const scoped = JSON.parse(extraFiltersKey) ?? {}
    if (projectId) scoped.project_id = projectId
    else if (reportId) scoped.report_id = reportId
    const filters = Object.keys(scoped).length ? scoped : undefined
    if (incremental) {
      const pageLimit = shownRef.current
      return fetchDomainRecords({ domain, system, appSlug: config.appSlug, filters, sortCol, sortDir, includeDeleted, limit: pageLimit, offset: 0, paged: true })
        .then((res) => {
          if (!isCurrent()) return
          const rows = res?.data ?? []
          recordsRef.current = rows
          setRecords(rows)
          setHasMore(res?.meta?.has_more ?? rows.length >= pageLimit)
        })
        .catch((err) => {
          if (isCurrent()) setError(err.message)
        })
        .finally(() => {
          if (isCurrent()) setLoading(false)
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
  }, [domain, system, config.appSlug, projectId, reportId, includeDeleted, limit, fetchAll, incremental, sortCol, sortDir, scopeMissing, extraFiltersKey])

  useEffect(() => {
    shownRef.current = FETCH_PAGE_SIZE
    load()
  }, [load])

  const loadMore = useCallback(async () => {
    if (!incremental || loadingMore) return
    const generation = generationRef.current
    const scoped = JSON.parse(extraFiltersKey) ?? {}
    if (projectId) scoped.project_id = projectId
    else if (reportId) scoped.report_id = reportId
    const filters = Object.keys(scoped).length ? scoped : undefined
    setLoadingMore(true)
    try {
      const res = await fetchDomainRecords({
        domain, system, appSlug: config.appSlug, filters, sortCol, sortDir, includeDeleted,
        limit: FETCH_PAGE_SIZE, offset: recordsRef.current.length, paged: true,
      })
      if (!mountedRef.current || generation !== generationRef.current) return
      const page = res?.data ?? []
      const next = [...recordsRef.current, ...page]
      recordsRef.current = next
      shownRef.current = next.length
      setRecords(next)
      setHasMore(res?.meta?.has_more ?? page.length >= FETCH_PAGE_SIZE)
    } catch (err) {
      if (mountedRef.current) setError(err.message)
    } finally {
      if (mountedRef.current) setLoadingMore(false)
    }
  }, [incremental, loadingMore, domain, system, config.appSlug, projectId, reportId, includeDeleted, sortCol, sortDir, extraFiltersKey])

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

  return { records, loading, error, creating, updating, deleting, reload: load, create, update, remove, hasMore, loadingMore, loadMore }
}
