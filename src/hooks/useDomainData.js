import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDomainRecords, createDomainRecord, updateDomainRecord, deleteDomainRecord } from '../data'
import { useAppConfig } from '../contexts/appConfigContext'

// `projectId` is an optional convenience filter: every domain used with it has
// a project_id field, so passing it here does a real server-side `filters:
// {project_id}` read instead of fetching every project's rows and filtering
// client-side. Omit it for domains/screens that intentionally want everything
// (e.g. the projects list itself, or a cross-project operator roll-up).
export function useDomainData({ domain, system, projectId }) {
  const { config } = useAppConfig()
  const [records, setRecords] = useState([])
  // Starts true, not false: the mount effect below always kicks off a fetch
  // immediately, so "loading" should be true from the very first render --
  // otherwise callers checking "is it safe to assume records is complete?"
  // get a false "no" for one render while records is still [].
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Per-request generation counter, not a shared cancelled boolean. A plain
  // boolean reset to false on every effect re-run can't tell an old in-flight
  // request apart from a new one -- if projectId starts undefined (project
  // still loading) then becomes real, the first (unfiltered, all-projects)
  // fetch can resolve AFTER the second (filtered) one and overwrite its
  // correct state with the stale unfiltered result, since the boolean got
  // reset to false again by the newer effect run before the old fetch
  // resolved. A monotonic generation number closes that window regardless of
  // resolution order: a response only applies if it's still the latest.
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
    // fetchDomainRecords defaults to limit: 25 (built for paginated admin
    // tables). Every consumer here expects the FULL (post-filter) set to
    // group/derive client-side, so without an explicit limit, any domain past
    // 25 rows silently truncates. The project_id filter (confirmed shape per
    // Portal_Independent_Frontend's queryFilters.js: {field: value} for
    // equality) does the real scoping; 1000 is just a backstop against a
    // single project ever exceeding that -- there's no confirmed server-side
    // range/date filter to narrow it further than "one project" today.
    const filters = projectId ? { project_id: projectId } : undefined
    return fetchDomainRecords({ domain, system, appSlug: config.appSlug, filters, limit: 1000 })
      .then((res) => {
        if (isCurrent()) setRecords(Array.isArray(res) ? res : (res?.data ?? []))
      })
      .catch((err) => {
        if (isCurrent()) setError(err.message)
      })
      .finally(() => {
        if (isCurrent()) setLoading(false)
      })
  }, [domain, system, config.appSlug, projectId])

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
