import { useState } from 'react'
import { uploadAttachment, getAttachments, deleteAttachment } from '../data'

function fmtSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Shared "upload a file, point a record field at it, delete whatever it
// replaced" flow -- the same three-step sequence (upload -> update -> delete
// old) that DredgeChartTab.replaceConfigFile, SafetyTab's signature
// handlers, and WeeklySummaryPage.handlePhotoUpload each hand-rolled
// separately. One hook instance covers one independent upload target (e.g.
// one signature slot); a caller with several independent slots calls this
// once per slot, same as it would with useState.
export function useAttachmentUpload() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  async function upload({
    recordId,
    domain,
    field,
    file,
    originalName,
    previousFileId,
    update,
    metadataPrefix,
    maxBytes,
    extra,
  }) {
    setUploading(true)
    setError(null)
    try {
      const id = typeof recordId === 'function' ? await recordId() : recordId
      if (!id) throw new Error('Could not resolve the record to attach this file to.')

      const resolvedFile = typeof file === 'function' ? await file(id) : file
      if (maxBytes && resolvedFile.size > maxBytes) {
        throw new Error(`File is ${fmtSize(resolvedFile.size)} — max is ${fmtSize(maxBytes)}.`)
      }

      const res = await uploadAttachment({ coreRecordId: id, domain, file: resolvedFile })

      let metadataPatch = {}
      if (metadataPrefix) {
        let storagePath = null
        try {
          const rows = await getAttachments({ coreRecordId: id, domain })
          storagePath = rows.find((r) => r.fileId === res.fileId)?.storagePath ?? null
        } catch {
          // best-effort -- storage_path is nice-to-have metadata, not required
          // to link the file
        }
        // originalName overrides the uploaded file's own name when the file
        // that actually got uploaded was derived/renamed from what the user
        // picked (e.g. a CSV converted to a PNG, or gzipped before upload) --
        // the metadata should record what the user chose, not the derived name.
        metadataPatch = {
          [`${metadataPrefix}_original_name`]: originalName ?? resolvedFile.name,
          [`${metadataPrefix}_storage_path`]: storagePath,
        }
      }

      await update(id, { [field]: res.fileId, ...metadataPatch, ...extra })

      if (previousFileId && previousFileId !== res.fileId) {
        await deleteAttachment({ fileId: previousFileId, domain, coreRecordId: id })
      }

      return res
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setUploading(false)
    }
  }

  function reset() {
    setUploading(false)
    setError(null)
  }

  return { uploading, error, upload, reset }
}
