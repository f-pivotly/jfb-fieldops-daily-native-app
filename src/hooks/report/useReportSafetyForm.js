import { useDebouncedRowForm } from '../ui/useDebouncedRowForm'

export function useReportSafetyForm({ reportId, reportSafety, create, update }) {
  return useDebouncedRowForm({ reportId, row: reportSafety, create, update })
}
