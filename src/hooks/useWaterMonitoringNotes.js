import { useDomainData } from './useDomainData'

// jfb_water_monitoring_notes has one row per report. Fetch-only half of the
// pair with useWaterMonitoringNotesForm (mirrors useReportSafety /
// useReportSafetyForm).
export function useWaterMonitoringNotes(reportId) {
  const { records, loading, error, creating, updating, create, update } =
    useDomainData({ domain: 'jfb_water_monitoring_notes', system: 'core', reportId })
  return { notes: records[0] ?? null, loading, error, creating, updating, create, update }
}
