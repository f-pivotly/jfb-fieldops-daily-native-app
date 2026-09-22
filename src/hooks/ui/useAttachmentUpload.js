import { useState } from 'react'
import { uploadAttachment, getAttachments, deleteAttachment } from '../../data'

function fmtSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

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
    // Set by callers that handle failures per file (flushFiles). The shared
    // `error` state would otherwise end up holding whichever upload failed
    // LAST, which is not the same thing as the list of what failed.
    quiet,
  }) {
    setUploading(true)
    if (!quiet) setError(null)
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
          // eslint-disable-next-line no-empty
        } catch {
        }
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
      if (!quiet) setError(err.message)
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
