import { useEffect, useState } from 'react'
import { downloadAttachment } from '../../../../data'
import { useAttachmentUpload } from '../../../../hooks/useAttachmentUpload'

// One signature slot (preparer or SSHO) on the safety report: downloads the
// existing image for preview, uploads a replacement via the shared
// useAttachmentUpload, and optionally clears the field. Signatures don't
// delete the file they replace (pre-existing behavior, not changed here --
// see useAttachmentUpload's previousFileId, simply never passed).
export function useSignatureUpload({
  existingFileId,
  ensureRecordId,
  updateRecord,
  domain,
  column,
  maxBytes,
  onUploaded,
  onSaved,
  onError,
}) {
  const [url, setUrl] = useState(null)
  // Local, inline-under-the-button validation error (file too large) --
  // distinct from onError, which reports actual load/upload/save failures
  // into the tab's shared banner. Kept separate to match the original
  // display split (size errors show next to the button, everything else
  // shows at the top of the tab).
  const [error, setError] = useState(null)
  const attachment = useAttachmentUpload()

  useEffect(() => {
    if (!existingFileId) return
    let cancelled = false
    downloadAttachment(existingFileId)
      .then((blob) => { if (!cancelled) setUrl(URL.createObjectURL(blob)) })
      .catch((err) => { if (!cancelled) onError?.(`Failed to load signature: ${err.message}`) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingFileId])

  async function upload(file) {
    if (!file) return
    if (maxBytes && file.size > maxBytes) {
      setError(`Signature image is ${(file.size / 1024).toFixed(0)} KB — must be ${maxBytes / 1024} KB or smaller.`)
      return
    }
    setError(null)
    setUrl(URL.createObjectURL(file))
    try {
      const res = await attachment.upload({
        recordId: ensureRecordId,
        domain,
        field: column,
        file,
        update: updateRecord,
      })
      await onUploaded?.(res.fileId, file)
      onSaved?.()
    } catch (err) {
      onError?.(err.message)
    }
  }

  async function remove() {
    const id = typeof ensureRecordId === 'function' ? await ensureRecordId() : ensureRecordId
    if (!id) return
    try {
      await updateRecord(id, { [column]: null })
      setUrl(null)
      onSaved?.()
    } catch (err) {
      onError?.(err.message)
    }
  }

  return { url, setUrl, error, uploading: attachment.uploading, upload, remove }
}
