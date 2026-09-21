import { useEffect, useState } from 'react'
import { fetchDomainRecords } from '../../data'
import { useAppConfig } from '../../contexts/appConfigContext'
import { utcDayRange, sameCalendarDay } from '../../lib/reportDates'


export function useDayActivities({ projectId, reportDate, equipmentId }) {
  const { config } = useAppConfig()
  const [activities, setActivities] = useState(null)

  useEffect(() => {
    if (!projectId || !reportDate || !equipmentId) return undefined
    let cancelled = false
    const { gte, lt } = utcDayRange(reportDate)
    fetchDomainRecords({
      domain: 'jfb_daily_activities', system: 'core', appSlug: config.appSlug,
      filters: { project_id: projectId, equipment_id: equipmentId, start_date_time: { gte, lt } },
      limit: 500,
    })
      .then((res) => {
        if (cancelled) return
        setActivities((res?.data ?? []).filter((a) => sameCalendarDay(a.start_date_time, reportDate, a.timezone)))
      })
      .catch(() => { if (!cancelled) setActivities([]) })
    return () => { cancelled = true }
  }, [projectId, reportDate, equipmentId, config.appSlug])

  return activities
}
