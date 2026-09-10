import { useEffect, useState } from 'react'
import { downloadAttachment } from '../data'
import { useAttachmentUpload } from './useAttachmentUpload'

export function useAttachmentField({
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
  const [error, setError] = useState(null)
  const attachment = useAttachmentUpload()

  useEffect(() => {
    if (!existingFileId) return
    let cancelled = false
    downloadAttachment(existingFileId)
      .then((blob) => { if (!cancelled) setUrl(URL.createObjectURL(blob)) })
      .catch((err) => { if (!cancelled) onError?.(`Failed to load file: ${err.message}`) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingFileId])

  async function upload(file) {
    if (!file) return
    if (maxBytes && file.size > maxBytes) {
      setError(`File is ${(file.size / (1024 * 1024)).toFixed(1)} MB — must be ${(maxBytes / (1024 * 1024)).toFixed(0)} MB or smaller.`)
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
