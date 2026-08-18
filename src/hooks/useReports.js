import { useCallback } from 'react'
import { useDomainData } from './useDomainData'

// Module-level (not per-component) so concurrent "create this report if
// missing" attempts for the same project+date -- from repeated effect
// fires, remounts, etc. -- share one in-flight create instead of each
// starting its own insert. Mirrors the legacy app's inflightReportDate
// guard in queries.ts, built for this exact race.
const inflightCreate = new Map()

export function useReports(projectId) {
  const { records, loading, error, creating, updating, create, update, remove } =
    useDomainData({ domain: 'jfb_reports', system: 'core', projectId })

  const ensureReport = useCallback(
    (payload) => {
      const key = `${payload.project_id}:${payload.report_date}`
      if (!inflightCreate.has(key)) {
        const promise = create(payload).catch((err) => {
          inflightCreate.delete(key)
          throw err
        })
        inflightCreate.set(key, promise)
      }
      return inflightCreate.get(key)
    },
    [create],
  )

  return { reports: records, loading, error, creating, updating, create, update, remove, ensureReport }
}
