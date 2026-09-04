import { useState } from 'react'
import { Box, Group, Text, Modal, Button } from '@mantine/core'
import PhotoSlot from './components/PhotoSlot'
import ReasonDialog from '../../../components/ReasonDialog'
import LoadingSpinner from '../../../components/LoadingSpinner'
import SafeError from '../../../components/SafeError'
import { useReportPhotos } from './hooks/useReportPhotos'
import { useAppConfig } from '../../../contexts/appConfigContext'
import { uploadAttachment, deleteAttachment, readWrittenRecordId } from '../../../data'
import { useFieldOpsAction } from '../../../contexts/fieldOpsAccessContext'

// Must match the real, published domain slug -- see the same note in
// DredgeChartTab.jsx (core.fnc_file_attach validates this against
// core.cfg_domain_info_cache_b, it can't be a cosmetic label).
const DOMAIN = 'jfb_report_photos'
const SLOTS = [1, 2]

function withUniqueName(file, uniqueId) {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot) : ''
  return new File([file], `${uniqueId}-${Date.now()}${ext}`, { type: file.type })
}

export default function PhotosTab({ project, report }) {
  const { config } = useAppConfig()
  const { photos, loading, error, create, update, remove } = useReportPhotos(report?.id)
  const [uploading, setUploading] = useState({ 1: false, 2: false })
  const [slotErrors, setSlotErrors] = useState({ 1: null, 2: null })
  const [rejectingPhoto, setRejectingPhoto] = useState(null)
  const [removingSlot, setRemovingSlot] = useState(null)

  const photoFor = (n) => photos.find((p) => p.photo_number === n) ?? null

  const canRejectPhotos = useFieldOpsAction('reject_photos')
  const canEdit = !!project?.id && !!report?.id
  const canReject = canEdit && canRejectPhotos && report?.status === 'cqc_review'

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
          original_file_name: file.name,
          uploaded_by: config?.user?.id ?? null,
          uploaded_date_time: new Date().toISOString(),
          pm_comment: null,
        })
      } else {
        const res = await create({
          project_id: project.id,
          report_id: report.id,
          photo_number: slot,
          label,
          original_file_name: file.name,
          uploaded_by: config?.user?.id ?? null,
          uploaded_date_time: new Date().toISOString(),
        })
        recordId = readWrittenRecordId(res)
      }
      if (!recordId) throw new Error('Could not resolve the saved photo record.')

      const uploadRes = await uploadAttachment({
        coreRecordId: recordId,
        domain: DOMAIN,
        file: withUniqueName(file, recordId),
      })
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

  function handleRemove(slot) {
    if (!photoFor(slot)) return
    setRemovingSlot(slot)
  }

  async function confirmRemove() {
    const slot = removingSlot
    setRemovingSlot(null)
    const target = photoFor(slot)
    if (!target) return
    setUploading((u) => ({ ...u, [slot]: true }))
    setSlotErrors((er) => ({ ...er, [slot]: null }))
    try {
      if (target.photo_file_path) {
        await deleteAttachment({ fileId: target.photo_file_path, domain: DOMAIN, coreRecordId: target.id })
      }
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

      <Modal
        opened={removingSlot != null}
        onClose={() => setRemovingSlot(null)}
        title={<Text fw={700} size="sm">{`Remove photo ${removingSlot ?? ''}?`}</Text>}
        size="sm"
      >
        <Text size="sm" mb={16}>The file will be deleted from storage.</Text>
        <Group justify="flex-end">
          <Button variant="default" size="xs" onClick={() => setRemovingSlot(null)}>
            Cancel
          </Button>
          <Button size="xs" color="red" onClick={confirmRemove}>
            Remove
          </Button>
        </Group>
      </Modal>
    </Box>
  )
}
