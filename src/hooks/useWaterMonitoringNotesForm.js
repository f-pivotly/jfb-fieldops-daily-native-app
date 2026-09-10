import { useDebouncedRowForm } from './useDebouncedRowForm'

export function useWaterMonitoringNotesForm({ projectId, reportId, notesRow, create, update }) {
  return useDebouncedRowForm({ projectId, reportId, row: notesRow, create, update })
}
