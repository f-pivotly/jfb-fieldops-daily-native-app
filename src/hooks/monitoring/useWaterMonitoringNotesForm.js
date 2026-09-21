import { useDebouncedRowForm } from '../ui/useDebouncedRowForm'

export function useWaterMonitoringNotesForm({ projectId, reportId, notesRow, create, update }) {
  return useDebouncedRowForm({ projectId, reportId, row: notesRow, create, update })
}
