import { useState } from 'react'
import { useDomainData } from '../../../../hooks/useDomainData'
import { useConfirmDialog } from '../../../../hooks/useConfirmDialog'

export function useDredgeCellStatus(projectId, reportDate) {
  const { records: cellStatusRecords, create: createCellStatus, update: updateCellStatus, remove: removeCellStatus } =
    useDomainData({ domain: 'jfb_dredge_cell_status', system: 'core', projectId })
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const [cellStatusBusy, setCellStatusBusy] = useState(false)

  const cellStatusByLabel = new Map((cellStatusRecords ?? []).map((r) => [r.cell_label, r]))
  const completedCellLabels = (cellStatusRecords ?? [])
    .filter((r) => r.completed_on <= reportDate)
    .map((r) => r.cell_label)

  const isCellEffectivelyComplete = (label) => {
    const row = cellStatusByLabel.get(label)
    return !!row && row.completed_on <= reportDate
  }

  const toggleCellComplete = async (label) => {
    const row = cellStatusByLabel.get(label)
    const effective = isCellEffectivelyComplete(label)
    if (effective) {
      if (!(await confirm(
        `Un-flag CSC ${label}?\n\nIt has been marked complete since ${row.completed_on.slice(0, 10)}. ` +
        'Removing the flag makes work inside it chart as 1st/2nd pass again (not residual) on all charts from that date forward.',
      ))) return
      setCellStatusBusy(true)
      try {
        await removeCellStatus(row.id)
      } finally {
        setCellStatusBusy(false)
      }
      return
    }
    setCellStatusBusy(true)
    try {
      if (row) {
        await updateCellStatus(row.id, { completed_on: reportDate })
      } else {
        await createCellStatus({ project_id: projectId, cell_label: label, completed_on: reportDate })
      }
    } finally {
      setCellStatusBusy(false)
    }
  }

  return { cellStatusRecords, cellStatusBusy, isCellEffectivelyComplete, completedCellLabels, toggleCellComplete, confirmModal }
}
