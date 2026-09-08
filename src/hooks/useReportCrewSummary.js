import { useDomainData } from './useDomainData'

// jfb_report_crew_summary_v2 has many rows per report (one per crew category).
export function useReportCrewSummary(reportId) {
  const { records, loading, error, creating, updating, deleting, reload, create, update, remove } =
    useDomainData({ domain: 'jfb_report_crew_summary_v2', system: 'core', reportId })
  return { crewSummary: records, loading, error, creating, updating, deleting, reload, create, update, remove }
}
