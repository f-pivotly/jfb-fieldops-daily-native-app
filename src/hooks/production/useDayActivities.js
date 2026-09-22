import { useEffect, useState } from 'react'
import { fetchDomainRecords } from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'


export function useDayActivities({ projectId, reportDate, equipmentId }) {
  const { config } = useAppConfig()
  const [activities, setActivities] = useState(null)

  useEffect(() => {
    if (!projectId || !reportDate || !equipmentId) return undefined
    let cancelled = false
    fetchDomainRecords({
      domain: 'jfb_daily_activities', system: 'core', appSlug: config.appSlug,
      filters: { project_id: projectId, equipment_id: equipmentId, report_date: reportDate },
      limit: 500,
    })
      .then((res) => {
        if (cancelled) return
        setActivities(res?.data ?? [])
      })
      .catch(() => { if (!cancelled) setActivities([]) })
    return () => { cancelled = true }
  }, [projectId, reportDate, equipmentId, config.appSlug])

  return activities
}
