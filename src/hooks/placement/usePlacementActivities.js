import { useEffect, useMemo, useState } from 'react'
import { fetchDomainRecords } from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'

const EMPTY = new Map()

export function usePlacementActivities(projectId, equipmentId, dates) {
  const { config } = useAppConfig()
  const [loaded, setLoaded] = useState({ key: null, map: EMPTY, error: null })

  const key = useMemo(() => {
    if (!projectId || !equipmentId) return null
    const wanted = [...new Set((dates ?? []).filter(Boolean))].sort()
    return wanted.length ? `${projectId}|${equipmentId}|${wanted.join(',')}` : null
  }, [projectId, equipmentId, dates])

  useEffect(() => {
    if (!key) return undefined
    let alive = true
    const wanted = key.split('|')[2].split(',')
    Promise.all(wanted.map((d) =>
      fetchDomainRecords({
        domain: 'jfb_daily_activities',
        system: 'core',
        appSlug: config.appSlug,
        filters: { project_id: projectId, equipment_id: equipmentId, report_date: d },
        limit: 1000,
      }).then((res) => [d, Array.isArray(res) ? res : (res?.data ?? [])]),
    ))
      .then((pairs) => { if (alive) setLoaded({ key, map: new Map(pairs), error: null }) })
      .catch((err) => { if (alive) setLoaded({ key, map: EMPTY, error: err.message }) })
    return () => { alive = false }
  }, [key, projectId, equipmentId, config.appSlug])

  const current = loaded.key === key
  return { activitiesByDate: current ? loaded.map : EMPTY, error: current ? loaded.error : null }
}
