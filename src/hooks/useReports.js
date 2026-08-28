import { useCallback } from 'react'
import { useDomainData } from './useDomainData'

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
