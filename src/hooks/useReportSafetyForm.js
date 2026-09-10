import { useDebouncedRowForm } from './useDebouncedRowForm'

export function useReportSafetyForm({ reportId, reportSafety, create, update }) {
  return useDebouncedRowForm({ reportId, row: reportSafety, create, update })
}
