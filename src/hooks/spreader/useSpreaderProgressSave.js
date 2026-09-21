import { useState } from 'react'
import { uploadAttachment } from '../../data'

const SPREADER_PROGRESS_DOMAIN = 'jfb_spreader_progress'

export function useSpreaderProgressSave({ report, selected, existingRow, updateProgress, reloadProgress, canvasRef }) {
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
      if (!existingRow?.id) throw new Error("Upload the day's Step Detail file before saving the chart.")
      const blob = await new Promise((res) => canvasRef.current?.toBlob(res, 'image/png'))
      if (!blob) throw new Error('Could not export the chart image.')
      const file = new File(
        [blob],
        `spreader_progress_${report.report_date}_${selected?.id ?? 'equipment'}.png`,
        { type: 'image/png' },
      )
      const uploadRes = await uploadAttachment({
        coreRecordId: existingRow.id,
        domain: SPREADER_PROGRESS_DOMAIN,
        file,
      })
      await updateProgress(existingRow.id, { chart_path: uploadRes.fileId })
      await reloadProgress()
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return { saving, saved, saveError, resetSaveState, handleSave }
}
