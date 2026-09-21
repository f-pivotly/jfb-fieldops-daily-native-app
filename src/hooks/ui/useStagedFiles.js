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
    for (const [field, staged] of Object.entries(stagedFiles)) {
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
      })
    }
    if (Object.keys(stagedFiles).length) setStagedFiles({})
  }

  async function flushTiles({ recordId, domain, existing, update }) {
    for (const [fieldName, list] of Object.entries(stagedTiles)) {
      if (!list?.length) continue
      const uploadedTiles = []
      for (const t of list) {
        const res = await uploadAttachment({ coreRecordId: recordId, domain, file: t.file })
        uploadedTiles.push({ file_id: res.fileId, georef: t.georef, original_name: t.originalName ?? t.file.name })
      }
      const merged = [...(existing?.[fieldName] ?? []), ...uploadedTiles]
      await update({ [fieldName]: merged })
    }
    if (Object.values(stagedTiles).some((l) => l?.length)) setStagedTiles({})
  }

  return { stagedFiles, stagedTiles, stageFile, unstageFile, stageTiles, flushFiles, flushTiles }
}
