import { makeListHook } from '../core/domainHookFactory'
import { createDomainRecord, deleteDomainRecord, fetchRecordsByField, updateDomainRecord } from '../../data'

const DOMAIN = 'jfb_realized_excluded_days'

export const useRealizedExcludedDays = makeListHook(DOMAIN, 'excludedDays', 'project')

export async function saveExcludedDays({ appSlug, projectId, dates, reason }) {
  const existing = await fetchRecordsByField({
    domain: DOMAIN, appSlug, field: 'exclude_date', values: dates, filters: { project_id: projectId },
  })
  const byDate = new Map()
  for (const row of existing) {
    const rows = byDate.get(row.exclude_date) ?? []
    rows.push(row)
    byDate.set(row.exclude_date, rows)
  }
  for (const date of dates) {
    const [keep, ...duplicates] = byDate.get(date) ?? []
    if (keep) {
      if (keep.reason !== reason) {
        await updateDomainRecord({ domain: DOMAIN, system: 'core', appSlug, recordId: keep.id, recordData: { reason } })
      }
    } else {
      await createDomainRecord({ domain: DOMAIN, system: 'core', appSlug, recordData: { project_id: projectId, exclude_date: date, reason } })
    }
    for (const dup of duplicates) {
      await deleteDomainRecord({ domain: DOMAIN, system: 'core', appSlug, recordId: dup.id })
    }
  }
}
