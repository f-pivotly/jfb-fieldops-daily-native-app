import { useState } from 'react'
import { uploadAttachment } from '../../../../data'
import { useAttachmentUpload } from '../../../../hooks/useAttachmentUpload'

// "Stage locally until Save" bookkeeping for the dredge-chart config form --
// nothing uploads on pick, matching the reference app exactly; only one
// Save flush loop uploads everything staged since the last save. Tiles are
// an array-merge ({file_id, georef} appended to the existing list), not a
// single-field pointer, so they go through plain uploadAttachment rather
// than useAttachmentUpload.
export function useStagedFiles() {
  const [stagedFiles, setStagedFiles] = useState({})
  const [stagedTiles, setStagedTiles] = useState({})
  const attachment = useAttachmentUpload()

  function stageFile(field, file, { originalName, extra } = {}) {
    setStagedFiles((s) => ({ ...s, [field]: { file, originalName: originalName ?? file.name, extra } }))
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
        update,
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
        uploadedTiles.push({ file_id: res.fileId, georef: t.georef })
      }
      const merged = [...(existing?.[fieldName] ?? []), ...uploadedTiles]
      await update({ [fieldName]: merged })
    }
    if (Object.values(stagedTiles).some((l) => l?.length)) setStagedTiles({})
  }

  return { stagedFiles, stagedTiles, stageFile, stageTiles, flushFiles, flushTiles }
}
