import { useEffect, useState } from 'react'
import { DEFAULT_CREW_CATEGORY_SEED, findMostRecentCrewCategories, priorReportsFor } from './safetyHistoryLookups'

// Auto-seed: a brand-new report with no crew rows yet inherits category
// names (not values) from the project's most recent prior report -- mirrors
// the reference app's real seed path, which treats the static default list
// as a last resort only. The "start seeding" decision is made during
// render (a one-shot-per-report gate, same shape as the crew-sync gate in
// SafetyTab); the effect below only runs the async work itself, so it
// never calls setState synchronously in its own body.
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
