import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchDomainRecords, createDomainRecord, updateDomainRecord, deleteDomainRecord } from '../data'
import { useAppConfig } from '../contexts/appConfigContext'

const PAGE_SIZE = 1000
const DOMAIN = 'jfb_report_metric_value'

export function useReportMetricValues() {
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
    const generation = ++generationRef.current
    const isCurrent = () => mountedRef.current && generationRef.current === generation
    if (isCurrent()) {
      setLoading(true)
      setError(null)
    }

    async function loadAll() {
      const all = []
      let offset = 0
      for (;;) {
        const res = await fetchDomainRecords({ domain: DOMAIN, system: 'core', appSlug: config.appSlug, limit: PAGE_SIZE, offset })
        const page = res?.data ?? []
        all.push(...page)
        if (page.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }
      return all
    }

    return loadAll()
      .then((all) => { if (isCurrent()) setRecords(all) })
      .catch((err) => { if (isCurrent()) setError(err.message) })
      .finally(() => { if (isCurrent()) setLoading(false) })
  }, [config.appSlug])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback(async (recordData) => {
    setCreating(true)
    try {
      const res = await createDomainRecord({ domain: DOMAIN, system: 'core', appSlug: config.appSlug, recordData })
      await load()
      return res
    } finally {
      setCreating(false)
    }
  }, [config.appSlug, load])

  const update = useCallback(async (recordId, recordData, extraParameters) => {
    setUpdating(true)
    try {
      const res = await updateDomainRecord({ domain: DOMAIN, system: 'core', appSlug: config.appSlug, recordId, recordData, extraParameters })
      await load()
      return res
    } finally {
      setUpdating(false)
    }
  }, [config.appSlug, load])

  const remove = useCallback(async (recordId) => {
    setDeleting(true)
    try {
      const res = await deleteDomainRecord({ domain: DOMAIN, system: 'core', appSlug: config.appSlug, recordId })
      await load()
      return res
    } finally {
      setDeleting(false)
    }
  }, [config.appSlug, load])

  return { reportMetricValues: records, loading, error, creating, updating, deleting, reload: load, create, update, remove }
}
