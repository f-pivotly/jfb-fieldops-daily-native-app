import { useState } from 'react'
import { uploadAttachment } from '../../data'
import { useAttachmentUpload } from './useAttachmentUpload'

export function useStagedFiles() {
  const [stagedFiles, setStagedFiles] = useState({})
  const [stagedTiles, setStagedTiles] = useState({})
  const attachment = useAttachmentUpload()

  function stageFile(field, file, { originalName, extra } = {}) {
    setStagedFiles((s) => ({ ...s, [field]: { file, originalName: originalName ?? file.name, extra } }))
  }

  function unstageFile(field) {
    setStagedFiles((s) => {
      const next = { ...s }
      delete next[field]
      return next
    })
  }

  function stageTiles(key, list) {
    setStagedTiles((s) => ({ ...s, [key]: list }))
  }

  async function flushFiles({ recordId, domain, existing, update }) {
    const failedUploads = []
    const uploaded = []
    for (const [field, staged] of Object.entries(stagedFiles)) {
      try {
        await attachment.upload({
          recordId,
          domain,
          field,
          file: staged.file,
          originalName: staged.originalName,
          previousFileId: existing?.[field] ?? null,
          metadataPrefix: field.replace(/_path$/, ''),
          extra: staged.extra,
          update: (_id, patch) => update(patch),
          quiet: true,
        })
        uploaded.push(field)
      } catch (err) {
        failedUploads.push({
          field,
          fileName: staged.originalName ?? staged.file?.name ?? 'file',
          message: err.message || 'Upload failed.',
        })
      }
    }
    if (uploaded.length) {
      setStagedFiles((s) => {
        const next = { ...s }
        for (const f of uploaded) delete next[f]
        return next
      })
    }
    return { failedUploads }
  }

  async function flushTiles({ recordId, domain, existing, update }) {
    const failedUploads = []
    const clearedFields = []
    for (const [fieldName, list] of Object.entries(stagedTiles)) {
      if (!list?.length) continue
      const uploadedTiles = []
      for (const t of list) {
        const name = t.originalName ?? t.file?.name ?? 'tile'
        try {
          const res = await uploadAttachment({ coreRecordId: recordId, domain, file: t.file })
          uploadedTiles.push({ file_id: res.fileId, georef: t.georef, original_name: name })
        } catch (err) {
          failedUploads.push({ field: fieldName, fileName: name, message: err.message || 'Upload failed.' })
        }
      }
      if (uploadedTiles.length) {
        const merged = [...(existing?.[fieldName] ?? []), ...uploadedTiles]
        await update({ [fieldName]: merged })
      }
      clearedFields.push(fieldName)
    }
    if (clearedFields.length) {
      setStagedTiles((s) => {
        const next = { ...s }
        for (const f of clearedFields) delete next[f]
        return next
      })
    }
    return { failedUploads }
  }

  return { stagedFiles, stagedTiles, stageFile, unstageFile, stageTiles, flushFiles, flushTiles }
}
