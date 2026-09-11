import { useState } from 'react'
import { uploadAttachment, readWrittenRecordId } from '../../../../data'
import { gzipBytes } from '../../../../lib/dredge/designVolume'

const DREDGE_PROGRESS_DOMAIN = 'jfb_dredge_progress'

export function useDredgeProgressSave({
  project,
  report,
  selected,
  userId,
  existingProgressRecord,
  createProgress,
  updateProgress,
  reloadProgress,
  displayedMaterialText,
  lastResult,
  editRef,
  canvasRef,
  runRender,
  surfaceDiffRef,
  clusterWindows,
  splitViews,
  resetPreview,
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const resetSaveState = () => {
    setSaved(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const recordData = {
        project_id: project.id,
        report_id: report.id,
        equipment_id: selected.id,
        coverage_rings: lastResult.todayRings,
        footprint_rings: lastResult.footprintRings,
        second_pass_flags: lastResult.secondRings.length ? lastResult.secondRings : null,
        advance_ft: lastResult.stats.advanceFt,
        advance_lines: lastResult.advanceLines.length ? lastResult.advanceLines : null,
        // Per-DMU SF breakdown -- Production Stats can pull SF + flag uncovered DMUs.
        cell_breakdown: lastResult.cellBreakdown?.length ? lastResult.cellBreakdown : null,
        today_sqft: lastResult.stats.todaySqFt,
        cumulative_sqft: lastResult.stats.cumulativeSqFt,
        gross_cy: lastResult.stats.grossCy ?? null,
        adjusted_cy: lastResult.stats.adjustedCy ?? null,
        placement_override: editRef.current.override ?? null,
        generated_by_user_id: userId ?? null,
        material_text: displayedMaterialText || null,
      }
      let progressId
      if (existingProgressRecord) {
        await updateProgress(existingProgressRecord.id, recordData)
        progressId = existingProgressRecord.id
      } else {
        const res = await createProgress(recordData)
        progressId = readWrittenRecordId(res)
      }

      if (progressId) {
        let blobs = []
        if (splitViews && clusterWindows.length >= 2) {
          const off = document.createElement('canvas')
          for (const w of clusterWindows) {
            runRender(w, off)
            const b = await new Promise((res) => off.toBlob(res, 'image/png'))
            if (b) blobs.push(b)
          }
        }
        if (blobs.length < 2) {
          const full = await new Promise((res) => canvasRef.current?.toBlob(res, 'image/png'))
          if (!full) throw new Error('Could not export the chart image.')
          blobs = [full]
        }
        const fileIds = []
        for (let i = 0; i < blobs.length; i++) {
          const file = new File([blobs[i]], `dredge_progress_${report.report_date}_${i + 1}.png`, { type: 'image/png' })
          const uploadRes = await uploadAttachment({ coreRecordId: progressId, domain: DREDGE_PROGRESS_DOMAIN, file })
          fileIds.push(uploadRes.fileId)
        }
        let surfaceExportPath
        if (surfaceDiffRef.current?.csvText) {
          const gz = await gzipBytes(new TextEncoder().encode(surfaceDiffRef.current.csvText))
          const surfaceFile = new File([gz], `dredge_surface_${report.report_date}.csv.gz`, { type: 'application/gzip' })
          const surfaceUploadRes = await uploadAttachment({ coreRecordId: progressId, domain: DREDGE_PROGRESS_DOMAIN, file: surfaceFile })
          surfaceExportPath = surfaceUploadRes.fileId
        }
        await updateProgress(progressId, {
          chart_path: fileIds[0],
          chart_paths: fileIds.length > 1 ? fileIds : null,
          ...(surfaceExportPath ? { surface_export_path: surfaceExportPath } : {}),
        })
      }

      await reloadProgress()
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      resetPreview()
      setSaving(false)
    }
  }

  return { saving, saved, saveError, resetSaveState, handleSave }
}
