import { useDebouncedRowForm } from '../ui/useDebouncedRowForm'

export function useAirMonitoringDailyForm({ projectId, reportId, dailyRow, create, update }) {
  return useDebouncedRowForm({ projectId, reportId, row: dailyRow, create, update })
}
