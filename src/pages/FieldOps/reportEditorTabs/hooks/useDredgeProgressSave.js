import { useState } from 'react'
import { uploadAttachment, deleteAttachment, readWrittenRecordId } from '../../../../data'
import { gzipBytes } from '../../../../lib/dredge/designVolume'
import { buildRawBatchArchive, batchFingerprint } from '../../../../lib/dredge/rawBatch'
import { dredgeFileName } from '../../../../lib/dredge/fileNames'

const DREDGE_PROGRESS_DOMAIN = 'jfb_dredge_progress'
const BATCH_UPLOAD_TIMEOUT_MS = 15 * 60 * 1000

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
  rawFiles,
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savePhase, setSavePhase] = useState('')

  const resetSaveState = () => {
    setSaved(false)
    setSaveError(null)
    setSavePhase('')
  }

  const uploadChartImages = async (progressId) => {
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
      const name = dredgeFileName({
        project, kind: 'dredge-chart', dateISO: report.report_date, equipment: selected, index: i + 1, ext: 'png',
      })
      const file = new File([blobs[i]], name, { type: 'image/png' })
      const uploadRes = await uploadAttachment({ coreRecordId: progressId, domain: DREDGE_PROGRESS_DOMAIN, file })
      fileIds.push(uploadRes.fileId)
    }
    return fileIds
  }

  const uploadRawBatch = async (progressId, replaceReason) => {
    const files = rawFiles ?? []
    if (!files.length) return {}

    const previousPath = existingProgressRecord?.source_batch_path ?? null
    const previousInfo = existingProgressRecord?.source_batch_info ?? null
    if (previousPath && previousInfo?.checksum === batchFingerprint(files)) return {}

    setSavePhase('Compressing source files…')
    const archive = await buildRawBatchArchive(files, (i, total) =>
      setSavePhase(`Compressing source files ${i}/${total}…`),
    )
    const { blob, ...info } = archive

    setSavePhase('Uploading source files…')
    const name = dredgeFileName({
      project, kind: 'dredge-raw', dateISO: report.report_date, equipment: selected, ext: 'zip',
    })
    const file = new File([blob], name, { type: 'application/zip' })
    const uploadRes = await uploadAttachment({
      coreRecordId: progressId,
      domain: DREDGE_PROGRESS_DOMAIN,
      file,
      tags: ['dredge-raw-batch', report.report_date, selected.id],
      timeout: BATCH_UPLOAD_TIMEOUT_MS,
      onUploadProgress: (ev) => {
        if (!ev.total) return
        setSavePhase(`Uploading source files ${Math.round((ev.loaded / ev.total) * 100)}%…`)
      },
    })

    const history = existingProgressRecord?.source_batch_history ?? []
    const nextHistory = previousPath
      ? [
          ...history,
          {
            file_id: previousPath,
            checksum: previousInfo?.checksum ?? null,
            file_count: previousInfo?.file_count ?? null,
            replaced_at: new Date().toISOString(),
            replaced_by: userId ?? null,
            reason: replaceReason ?? null,
          },
        ]
      : history

    return {
      patch: {
        source_batch_path: uploadRes.fileId,
        source_batch_info: {
          ...info,
          uploaded_at: new Date().toISOString(),
          uploaded_by: userId ?? null,
        },
        source_batch_history: nextHistory.length ? nextHistory : null,
      },
      supersededPath: previousPath,
    }
  }

  const handleSave = async ({ replaceReason } = {}) => {
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
        const fileIds = await uploadChartImages(progressId)
        let surfaceExportPath
        if (surfaceDiffRef.current?.csvText) {
          const gz = await gzipBytes(new TextEncoder().encode(surfaceDiffRef.current.csvText))
          const surfaceName = dredgeFileName({
            project, kind: 'dredge-surface', dateISO: report.report_date, equipment: selected, ext: 'csv.gz',
          })
          const surfaceFile = new File([gz], surfaceName, { type: 'application/gzip' })
          const surfaceUploadRes = await uploadAttachment({ coreRecordId: progressId, domain: DREDGE_PROGRESS_DOMAIN, file: surfaceFile })
          surfaceExportPath = surfaceUploadRes.fileId
        }

        const { patch: batchPatch, supersededPath } = await uploadRawBatch(progressId, replaceReason)

        setSavePhase('Saving…')
        await updateProgress(progressId, {
          chart_path: fileIds[0],
          chart_paths: fileIds.length > 1 ? fileIds : null,
          ...(surfaceExportPath ? { surface_export_path: surfaceExportPath } : {}),
          ...batchPatch,
        })

        if (supersededPath) {
          await deleteAttachment({
            fileId: supersededPath,
            domain: DREDGE_PROGRESS_DOMAIN,
            coreRecordId: progressId,
          }).catch((err) => console.error('Could not remove the superseded RAW batch:', err.message))
        }
      }

      await reloadProgress()
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSavePhase('')
      resetPreview()
      setSaving(false)
    }
  }

  return { saving, saved, saveError, savePhase, resetSaveState, handleSave }
}
