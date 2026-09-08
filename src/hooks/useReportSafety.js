import { useDomainData } from './useDomainData'

// jfb_report_safety_v2 has one row per report (unique on report_id).
export function useReportSafety(reportId) {
  const { records, loading, error, creating, updating, create, update } =
    useDomainData({ domain: 'jfb_report_safety_v2', system: 'core', reportId })
  const reportSafety = records[0] ?? null
  return { reportSafety, loading, error, creating, updating, create, update }
}
