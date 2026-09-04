import { useEffect, useRef, useState } from 'react'
import { executeDataView } from '../../../../data'
import { useDomainData } from '../../../../hooks/useDomainData'

// "Today's context" for the Narratives tab: per-equipment Op/Delay hours and
// event list (from the dvw-jfb-narrative-context-events data view, which
// does the delay-code/area JOIN work server-side) plus CY/SF (from the
// existing jfb_production_stats domain read -- that table is small enough
// per-report that a dedicated data view isn't worth the round trip).
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
    executeDataView('dvw-jfb-narrative-context-events', { p_project_id: projectId, p_report_date: reportDate })
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

  const { records: statsRecords } = useDomainData({ domain: 'jfb_production_stats', system: 'core', projectId })

  const byEquipment = equipment.map((eq) => {
    const eqEvents = events
      .filter((e) => e.equipment_id === eq.id)
      .sort((a, b) => new Date(a.start_date_time) - new Date(b.start_date_time))
    const operatingHours = eqEvents
      .filter((e) => !!e.is_operational)
      .reduce((sum, e) => sum + Number(e.duration_hours ?? 0), 0)
    const delayHours = eqEvents
      .filter((e) => !e.is_operational)
      .reduce((sum, e) => sum + Number(e.duration_hours ?? 0), 0)
    const eqStats = statsRecords.filter((s) => s.equipment_id === eq.id && s.report_id === reportId)
    const cy = eqStats.reduce((sum, s) => sum + Number(s.volume ?? 0), 0)
    const sf = eqStats.reduce((sum, s) => sum + Number(s.area ?? 0), 0)
    return { equipment: eq, events: eqEvents, operatingHours, delayHours, cy, sf }
  })

  return { byEquipment, loading, error }
}
