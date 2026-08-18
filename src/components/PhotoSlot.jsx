import { useEffect, useRef, useState } from 'react'
import { Box, Text, TextInput, Badge, Group, ActionIcon, Button } from '@mantine/core'
import { IconPhoto } from '@tabler/icons-react'
import CropDialog from './CropDialog'
import { downloadAttachment } from '../data'

const PHOTO_MAX_BYTES = 10 * 1024 * 1024
const PHOTO_ACCEPTED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'])
const HEIC_EXTS = ['.heic', '.heif']

function isHeicName(name) {
  const lower = (name || '').toLowerCase()
  return HEIC_EXTS.some((e) => lower.endsWith(e))
}

function fmtSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function PhotoSlot({
  slotNumber,
  photo,
  uploading,
  error,
  onUpload,
  onLabelChange,
  onRemove,
  canEdit,
  canReject,
  onReject,
  onClearRejection,
}) {
  const fileInputRef = useRef(null)
  const labelInputRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  // HEIC can't be decoded by browsers, so we can't know it's HEIC from the
  // stored fileId (unlike the web app, which reads it off storage_path's
  // extension) -- we only find out once the attachment's mime_type comes
  // back from the download response.
  const [previewMime, setPreviewMime] = useState(null)
  const [labelDraft, setLabelDraft] = useState(photo?.label ?? '')
  const [previewError, setPreviewError] = useState(null)
  const [pendingCropFile, setPendingCropFile] = useState(null)

  // Resolve the attachment blob whenever photo_file_path changes -- keyed
  // strictly on that field (not the whole photo object). The parent
  // re-creates the photo object on every label save, and including the
  // object reference here would re-fire this effect on every keystroke,
  // wiping the preview and re-downloading the image each time. This is a
  // genuine data-fetch-with-cleanup effect (revokes the object URL), so the
  // reset-then-fetch shape is intentional -- not the "you might not need an
  // effect" case react-hooks/set-state-in-effect is meant to catch.
  useEffect(() => {
    let alive = true
    let objectUrl = null
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrl(null)
    setPreviewMime(null)
    setPreviewError(null)
    if (photo?.photo_file_path) {
      downloadAttachment(photo.photo_file_path)
        .then((blob) => {
          if (!alive) return
          objectUrl = URL.createObjectURL(blob)
          setPreviewUrl(objectUrl)
          setPreviewMime(blob.type || null)
        })
        .catch((e) => {
          if (alive) setPreviewError(e?.message || 'Could not load preview.')
        })
    }
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photo?.photo_file_path])

  // Sync label draft when a different photo lands in this slot, using
  // React's documented "adjust state during render" reset pattern (not an
  // effect) -- keyed on photo.id ONLY, since including label here would let
  // an in-flight save round-trip overwrite text the user is still typing.
  const [syncedPhotoId, setSyncedPhotoId] = useState(photo?.id)
  if (photo?.id !== syncedPhotoId) {
    setSyncedPhotoId(photo?.id)
    setLabelDraft(photo?.label ?? '')
  }

  const debounce = useRef(null)
  const pendingLabelRef = useRef(null)
  const onLabelChangeRef = useRef(onLabelChange)
  useEffect(() => {
    onLabelChangeRef.current = onLabelChange
  })

  function flushLabel() {
    if (debounce.current) {
      clearTimeout(debounce.current)
      debounce.current = null
    }
    const pending = pendingLabelRef.current
    if (pending === null) return
    pendingLabelRef.current = null
    onLabelChangeRef.current(pending)
  }

  // Flush on unmount so a tab switch within the debounce window doesn't
  // drop the typed text.
  useEffect(() => {
    return () => flushLabel()
  }, [])

  function handleLabelInput(next) {
    setLabelDraft(next)
    pendingLabelRef.current = next
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      debounce.current = null
      pendingLabelRef.current = null
      onLabelChangeRef.current(next)
    }, 600)
  }

  function wrapSelection(marker) {
    const el = labelInputRef.current
    if (!el || !canEdit) return
    const start = el.selectionStart ?? labelDraft.length
    const end = el.selectionEnd ?? labelDraft.length
    const before = labelDraft.slice(0, start)
    const selected = labelDraft.slice(start, end)
    const after = labelDraft.slice(end)
    const next = `${before}${marker}${selected}${marker}${after}`
    handleLabelInput(next)
    requestAnimationFrame(() => {
      if (!labelInputRef.current) return
      const newStart = start + marker.length
      const newEnd = newStart + selected.length
      labelInputRef.current.selectionStart = newStart
      labelInputRef.current.selectionEnd = newEnd
      labelInputRef.current.focus()
    })
  }

  function insertAtCursor(text) {
    const el = labelInputRef.current
    if (!el || !canEdit) return
    const start = el.selectionStart ?? labelDraft.length
    const end = el.selectionEnd ?? labelDraft.length
    const before = labelDraft.slice(0, start)
    const after = labelDraft.slice(end)
    const next = `${before}${text}${after}`
    handleLabelInput(next)
    requestAnimationFrame(() => {
      if (!labelInputRef.current) return
      const caret = start + text.length
      labelInputRef.current.selectionStart = caret
      labelInputRef.current.selectionEnd = caret
      labelInputRef.current.focus()
    })
  }

  function handleLabelKeyDown(e) {
    if (!canEdit) return
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    if (e.key === 'i' || e.key === 'I') {
      e.preventDefault()
      wrapSelection('*')
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault()
      wrapSelection('**')
    }
  }

  function validateFile(file) {
    if (file.size > PHOTO_MAX_BYTES) return `File is ${fmtSize(file.size)} — max is 10 MB.`
    const okMime = !!file.type && PHOTO_ACCEPTED_MIMES.has(file.type)
    const okExt = /\.(jpe?g|png|heic|heif)$/i.test(file.name)
    if (!okMime && !okExt) return 'Only JPEG, PNG, and HEIC files are allowed.'
    return null
  }

  function handleFiles(files) {
    if (!files || files.length === 0) return
    const file = files[0]
    const err = validateFile(file)
    if (err) {
      setPreviewError(err)
      return
    }
    setPreviewError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (isHeicName(file.name)) {
      onUpload(file, (labelDraft || photo?.label || '').trim())
      return
    }
    setPendingCropFile(file)
  }

  function handleCropConfirmed(cropped) {
    setPendingCropFile(null)
    onUpload(cropped, (labelDraft || photo?.label || '').trim())
  }

  const rejected = !!photo?.pm_comment
  const showHeicPlaceholder = !!photo && (previewMime === 'image/heic' || previewMime === 'image/heif')

  return (
    <Box style={{ background: '#fff', border: `1px solid ${rejected ? '#fb923c' : 'var(--mantine-color-gray-3)'}`, borderRadius: 8, overflow: 'hidden' }}>
      <Group justify="space-between" px={16} py={8} style={{ background: 'var(--mantine-color-gray-0)', borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">Photo {slotNumber}</Text>
        {rejected && <Badge size="xs" color="orange">Rejected</Badge>}
        {photo && !rejected && photo.uploaded_date_time && (
          <Text size="10px" c="dimmed">{new Date(photo.uploaded_date_time).toLocaleString()}</Text>
        )}
      </Group>

      <Box pos="relative" style={{ aspectRatio: '4 / 3', background: 'var(--mantine-color-gray-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {photo ? (
          showHeicPlaceholder ? (
            <Box px={16} ta="center">
              <Text size="sm" fw={600}>HEIC photo uploaded</Text>
              <Text size="xs" c="dimmed" mt={4}>
                Browser preview not available for HEIC. The file is stored and will render in the PDF after conversion.
              </Text>
            </Box>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt={photo.label || `Photo ${slotNumber}`}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <Text size="xs" c="dimmed">Loading preview…</Text>
          )
        ) : (
          <DropZone disabled={!canEdit || uploading} onClick={() => fileInputRef.current?.click()} onFiles={handleFiles} />
        )}
        {uploading && (
          <Box style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text size="sm">Uploading…</Text>
          </Box>
        )}
      </Box>

      {rejected && (
        <Box px={16} py={8} style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
          <Text size="10px" fw={700} c="#c2410c" tt="uppercase">PM comment</Text>
          <Text size="sm" c="#9a3412" mt={2}>{photo.pm_comment}</Text>
        </Box>
      )}

      <Box px={16} py={12}>
        <Group justify="space-between" mb={4}>
          <Text size="10px" tt="uppercase" c="dimmed">Label</Text>
          <Group gap={4}>
            <ActionIcon variant="default" size="sm" disabled={!canEdit} onClick={() => wrapSelection('*')} onMouseDown={(e) => e.preventDefault()} title="Italic (Ctrl+I)">
              <Text size="11px" style={{ fontStyle: 'italic' }}>I</Text>
            </ActionIcon>
            <ActionIcon variant="default" size="sm" disabled={!canEdit} onClick={() => wrapSelection('**')} onMouseDown={(e) => e.preventDefault()} title="Bold (Ctrl+B)">
              <Text size="11px" fw={700}>B</Text>
            </ActionIcon>
            <ActionIcon variant="default" size="sm" disabled={!canEdit} onClick={() => insertAtCursor('≥')} onMouseDown={(e) => e.preventDefault()} title="Insert ≥ (greater-than-or-equal)">
              <Text size="11px">≥</Text>
            </ActionIcon>
            <ActionIcon variant="default" size="sm" disabled={!canEdit} onClick={() => insertAtCursor('≤')} onMouseDown={(e) => e.preventDefault()} title="Insert ≤ (less-than-or-equal)">
              <Text size="11px">≤</Text>
            </ActionIcon>
          </Group>
        </Group>
        <TextInput
          ref={labelInputRef}
          size="xs"
          value={labelDraft}
          onChange={(e) => handleLabelInput(e.currentTarget.value)}
          onBlur={flushLabel}
          onKeyDown={handleLabelKeyDown}
          disabled={!canEdit || (!photo && !labelDraft)}
          placeholder={photo ? 'Describe what this photo shows' : 'Add a label first, then upload'}
        />
        <Text size="10px" c="dimmed" mt={2}>
          Use *asterisks* for italic, **double** for bold (e.g. *Kevin Zenke*).
        </Text>
        {photo && !labelDraft.trim() && (
          <Text size="11px" c="#b5740a" mt={4}>A label is required before submitting for PM review.</Text>
        )}

        {(error || previewError) && (
          <Text size="xs" c="#d32129" mt={4}>{error || previewError}</Text>
        )}

        {canEdit && (
          <Group gap={8} mt={8}>
            <Button size="xs" variant="default" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {photo ? 'Replace' : 'Upload'}
            </Button>
            {photo && (
              <Button size="xs" variant="default" c="#d32129" onClick={onRemove} disabled={uploading}>
                Remove
              </Button>
            )}
            {photo && canReject && !rejected && onReject && (
              <Button size="xs" variant="default" c="#c2410c" onClick={onReject} disabled={uploading} title="Flag this photo for the PE to replace">
                Reject
              </Button>
            )}
            {photo && canReject && rejected && onClearRejection && (
              <Button size="xs" variant="default" onClick={onClearRejection} disabled={uploading} title="Clear the rejection so PE doesn't have to replace this photo">
                Clear rejection
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif"
              onChange={(e) => handleFiles(e.target.files)}
              style={{ display: 'none' }}
            />
          </Group>
        )}
      </Box>

      <CropDialog
        file={pendingCropFile}
        label={(labelDraft || photo?.label || '').trim() || undefined}
        onCancel={() => setPendingCropFile(null)}
        onConfirm={handleCropConfirmed}
      />
    </Box>
  )
}

function DropZone({ disabled, onClick, onFiles }) {
  const [dragging, setDragging] = useState(false)
  return (
    <Box
      onClick={disabled ? undefined : onClick}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (!disabled) onFiles(e.dataTransfer.files)
      }}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        background: dragging ? 'var(--mantine-color-blue-0)' : 'transparent',
        color: disabled ? 'var(--mantine-color-gray-4)' : 'var(--mantine-color-gray-6)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <IconPhoto size={32} />
      <Text size="sm" fw={600}>Click to browse or drop a photo</Text>
      <Text size="11px" c="dimmed">JPEG, PNG, or HEIC · max 10 MB</Text>
    </Box>
  )
}
