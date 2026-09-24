import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchDomainRecords } from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'
import { reportWindowUtc } from '../../lib/waterQuality/data'
import { FETCH_PAGE_SIZE } from '../../constants/pagination'

const PAGE_SIZE = FETCH_PAGE_SIZE

export function useWaterQualityReadings(config, dateISO) {
  const { config: appConfig } = useAppConfig()
  const [fetched, setFetched] = useState({ key: null, readings: [], loading: false, error: null })
  const generationRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const projectId = config?.project_id
  const windowStart = config?.window_start
  const windowEnd = config?.window_end
  const timezone = config?.timezone
  const key = projectId && dateISO ? `${projectId}|${windowStart}|${windowEnd}|${timezone}|${dateISO}` : null

  const load = useCallback(() => {
    if (!key || !config) return
    const generation = ++generationRef.current
    const isCurrent = () => mountedRef.current && generationRef.current === generation
    if (isCurrent()) setFetched({ key, readings: [], loading: true, error: null })

    const { startUtc, endUtc } = reportWindowUtc(config, dateISO)
    const filters = {
      project_id: projectId,
      reading_at: { gte: startUtc.toISOString(), lt: new Date(endUtc.getTime() + 1).toISOString() },
    }

    async function loadAll() {
      const all = []
      let offset = 0
      for (;;) {
        const res = await fetchDomainRecords({
          domain: 'jfb_water_quality_readings', system: 'core', appSlug: appConfig.appSlug,
          filters, limit: PAGE_SIZE, offset,
        })
        const page = res?.data ?? []
        all.push(...page)
        if (page.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }
      return all
    }

    loadAll()
      .then((all) => { if (isCurrent()) setFetched({ key, readings: all, loading: false, error: null }) })
      .catch((err) => { if (isCurrent()) setFetched({ key, readings: [], loading: false, error: err.message }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    load()
  }, [load])

  if (!key) return { readings: [], loading: false, error: null }
  if (fetched.key !== key) return { readings: [], loading: true, error: null }
  return { readings: fetched.readings, loading: fetched.loading, error: fetched.error }
}
