import { useEffect, useRef, useState } from 'react'
import { executeDataView } from '../../../../data'
import { useDomainData } from '../../../../hooks/useDomainData'
import { isOperationalCategory, normalizedCategory, TRANSITION_CATEGORY } from '../../../../lib/operationalCategory'

function compareEventsChrono(a, b) {
  const dt = Date.parse(a.start_date_time) - Date.parse(b.start_date_time)
  if (dt !== 0) return dt
  const aTransition = a.category === TRANSITION_CATEGORY
  const bTransition = b.category === TRANSITION_CATEGORY
  if (aTransition && !bTransition) return -1
  if (bTransition && !aTransition) return 1
  return 0
}

export function useNarrativeContext({ projectId, reportId, reportDate, equipment }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  useEffect(() => {
    if (!projectId || !reportDate) {
      if (mountedRef.current) {
        setEvents([])
        setLoading(false)
      }
      return
    }
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }
    executeDataView('dvw-jfb-narrative-context-events-v2', { p_project_id: projectId, p_report_date: reportDate })
      .then((rows) => {
        if (mountedRef.current) setEvents(Array.isArray(rows) ? rows : [])
      })
      .catch((err) => {
        if (mountedRef.current) setError(err?.message || 'Failed to load context.')
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false)
      })
  }, [projectId, reportDate])

  const { records: statsRecords, loading: statsLoading, error: statsError } = useDomainData({
    domain: 'jfb_production_stats',
    system: 'core',
    reportId,
  })

  const byEquipment = equipment.map((eq) => {
    const eqEvents = events
      .filter((e) => e.equipment_id === eq.id)
      .sort(compareEventsChrono)
    let operatingHours = 0
    let delayHours = 0
    for (const e of eqEvents) {
      const hours = Number(e.duration_hours ?? 0)
      if (isOperationalCategory(e.category)) operatingHours += hours
      else if (normalizedCategory(e.category) !== TRANSITION_CATEGORY) delayHours += hours
    }
    const eqStats = statsRecords.filter((s) => s.equipment_id === eq.id)
    const cy = eqStats.reduce((sum, s) => sum + Number(s.volume ?? 0), 0)
    const sf = eqStats.reduce((sum, s) => sum + Number(s.area ?? 0), 0)
    return { equipment: eq, events: eqEvents, operatingHours, delayHours, cy, sf }
  })

  return {
    byEquipment,
    loading: loading || (!!reportId && statsLoading),
    error: error || statsError,
  }
}
