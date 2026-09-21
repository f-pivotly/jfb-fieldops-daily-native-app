import { useEffect, useState } from 'react'
import { DEFAULT_CREW_CATEGORY_SEED, findMostRecentCrewCategories, priorReportsFor } from './safetyHistoryLookups'

export function useCrewSeeding({ report, reports, appSlug, crewLoading, crewSummary, createCrewRow }) {
  const [seededFor, setSeededFor] = useState(null)
  const [seeding, setSeeding] = useState(false)

  if (report?.id && !crewLoading && crewSummary.length === 0 && seededFor !== report.id) {
    setSeededFor(report.id)
    setSeeding(true)
  }

  useEffect(() => {
    if (!seeding || !report?.id) return
    let cancelled = false
    const candidates = priorReportsFor(reports, report)
    ;(async () => {
      let seed = DEFAULT_CREW_CATEGORY_SEED
      try {
        const prior = await findMostRecentCrewCategories(candidates, appSlug)
        if (prior && prior.length > 0) seed = prior
      } catch (err) {
        console.error('Crew category lookup failed, using defaults:', err.message)
      }
      for (const c of seed) {
        await createCrewRow({ report_id: report.id, category: c.category, sort_order: c.sort_order, count: 0, hours: 0 })
      }
    })().finally(() => { if (!cancelled) setSeeding(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeding, report?.id])

  return { seeding }
}
