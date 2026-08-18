import { useState } from 'react'
import { Box, Group, Text } from '@mantine/core'
import PhotoSlot from '../../../components/PhotoSlot'
import ReasonDialog from '../../../components/ReasonDialog'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'
import { useReportPhotos } from '../../../hooks/useReportPhotos'
import { useAppConfig } from '../../../contexts/appConfigContext'
import { uploadAttachment, deleteAttachment, readWrittenRecordId } from '../../../data'

// Core-data domain slug -- must stay exactly this, it's the registered
// Pivotly domain (see domain/jfb_report_photos.json). Also passed as the
// Attachments API's domain param: deleting the photo's domain record
// auto-soft-deletes its linked attachment only when this matches exactly.
const DOMAIN = 'jfb_report_photos'
const SLOTS = [1, 2]

export default function PhotosTab({ project, report }) {
  const { config } = useAppConfig()
  const { photos, loading, error, create, update, remove } = useReportPhotos(report?.id)
  const [uploading, setUploading] = useState({ 1: false, 2: false })
  const [slotErrors, setSlotErrors] = useState({ 1: null, 2: null })
  const [rejectingPhoto, setRejectingPhoto] = useState(null)

  const photoFor = (n) => photos.find((p) => p.photo_number === n) ?? null

  const canEdit = !!project?.id && !!report?.id
  // No role/permission system exists anywhere in this app yet -- PMReviewPanel
  // shows its Approve/Send-back actions unconditionally too. Reject /
  // clear-rejection follow that same precedent: gated on report status like
  // the web app's canReject, minus the role check.
  const canReject = canEdit && report?.status === 'cqc_review'

  async function handleUpload(slot, file, label) {
    if (!canEdit) return
    setUploading((u) => ({ ...u, [slot]: true }))
    setSlotErrors((e) => ({ ...e, [slot]: null }))
    try {
      const existing = photoFor(slot)
      const previousFileId = existing?.photo_file_path || null
      let recordId

      if (existing) {
        recordId = existing.id
        await update(recordId, {
          label,
          uploaded_by: config?.user?.id ?? null,
          uploaded_date_time: new Date().toISOString(),
          // Replacing a rejected photo clears the rejection so PM re-reviews.
          pm_comment: null,
        })
      } else {
        const res = await create({
          project_id: project.id,
          report_id: report.id,
          photo_number: slot,
          label,
          uploaded_by: config?.user?.id ?? null,
          uploaded_date_time: new Date().toISOString(),
        })
        recordId = readWrittenRecordId(res)
      }
      if (!recordId) throw new Error('Could not resolve the saved photo record.')

      const uploadRes = await uploadAttachment({ coreRecordId: recordId, domain: DOMAIN, file })
      await update(recordId, { photo_file_path: uploadRes.fileId })

      if (previousFileId && previousFileId !== uploadRes.fileId) {
        await deleteAttachment({ fileId: previousFileId, domain: DOMAIN, coreRecordId: recordId })
      }
    } catch (e) {
      setSlotErrors((er) => ({ ...er, [slot]: e?.message || 'Upload failed.' }))
    } finally {
      setUploading((u) => ({ ...u, [slot]: false }))
    }
  }

  async function handleLabelChange(slot, label) {
    const target = photoFor(slot)
    if (!target || target.label === label) return
    try {
      await update(target.id, { label })
    } catch (e) {
      setSlotErrors((er) => ({ ...er, [slot]: e?.message || 'Could not save label.' }))
    }
  }

  async function handleRemove(slot) {
    const target = photoFor(slot)
    if (!target) return
    if (!window.confirm(`Remove photo ${slot}? The file will be deleted from storage.`)) return
    setUploading((u) => ({ ...u, [slot]: true }))
    setSlotErrors((er) => ({ ...er, [slot]: null }))
    try {
      // Deleting the domain record auto-soft-deletes its linked attachment
      // (Portal_Independent_Backend's core-data-write delete path).
      await remove(target.id)
    } catch (e) {
      setSlotErrors((er) => ({ ...er, [slot]: e?.message || 'Delete failed.' }))
    } finally {
      setUploading((u) => ({ ...u, [slot]: false }))
    }
  }

  async function handleRejectConfirm(reason) {
    if (!rejectingPhoto) return
    try {
      await update(rejectingPhoto.id, { pm_comment: reason })
      setRejectingPhoto(null)
    } catch (e) {
      setSlotErrors((er) => ({ ...er, [rejectingPhoto.photo_number]: e?.message || 'Could not save rejection.' }))
    }
  }

  async function handleClearRejection(slot) {
    const target = photoFor(slot)
    if (!target) return
    setUploading((u) => ({ ...u, [slot]: true }))
    try {
      await update(target.id, { pm_comment: null })
    } catch (e) {
      setSlotErrors((er) => ({ ...er, [slot]: e?.message || 'Could not clear rejection.' }))
    } finally {
      setUploading((u) => ({ ...u, [slot]: false }))
    }
  }

  if (loading) return <LoadingSpinner py={16} />

  const acceptedCount = photos.filter((p) => !!p.label && p.label.trim().length > 0 && !p.pm_comment).length

  return (
    <Box>
      <SafeError message={error} />

      <Group justify="space-between" mb={12}>
        <Text size="sm">{acceptedCount} of 2 photos complete</Text>
        <Text size="xs" c="dimmed">JPEG / PNG / HEIC · 10 MB max</Text>
      </Group>

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {SLOTS.map((n) => {
          const p = photoFor(n)
          return (
            <PhotoSlot
              key={n}
              slotNumber={n}
              photo={p}
              uploading={uploading[n]}
              error={slotErrors[n]}
              onUpload={(file, label) => handleUpload(n, file, label)}
              onLabelChange={(label) => handleLabelChange(n, label)}
              onRemove={() => handleRemove(n)}
              canEdit={canEdit}
              canReject={canReject}
              onReject={p ? () => setRejectingPhoto(p) : undefined}
              onClearRejection={p?.pm_comment ? () => handleClearRejection(n) : undefined}
            />
          )
        })}
      </Box>

      <ReasonDialog
        opened={!!rejectingPhoto}
        onClose={() => setRejectingPhoto(null)}
        title={`Reject photo ${rejectingPhoto?.photo_number ?? ''}`}
        label="Reason"
        placeholder="e.g. cutterhead not visible, image is blurry, wrong area"
        confirmLabel="Reject photo"
        confirmColor="red"
        onConfirm={handleRejectConfirm}
      />
    </Box>
  )
}
