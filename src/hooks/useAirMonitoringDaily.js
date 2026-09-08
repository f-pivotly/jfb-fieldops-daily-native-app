import { useDomainData } from './useDomainData'

// jfb_air_monitoring_daily has one row per report. Fetch-only half of the
// pair with useAirMonitoringDailyForm (mirrors useReportSafety /
// useReportSafetyForm).
export function useAirMonitoringDaily(reportId) {
  const { records, loading, error, creating, updating, create, update } =
    useDomainData({ domain: 'jfb_air_monitoring_daily', system: 'core', reportId })
  return { daily: records[0] ?? null, loading, error, creating, updating, create, update }
}
