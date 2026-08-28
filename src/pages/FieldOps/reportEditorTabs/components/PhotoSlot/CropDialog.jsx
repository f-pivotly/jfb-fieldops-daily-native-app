import { useEffect, useRef, useState } from 'react'
import { Modal, Text, Group, Button, Box } from '@mantine/core'
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

const TARGET_ASPECT = 4 / 3
const OUTPUT_QUALITY = 0.92

export default function CropDialog({ file, onCancel, onConfirm, label }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [crop, setCrop] = useState()
  const [completedCrop, setCompletedCrop] = useState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const imgRef = useRef(null)

  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImageUrl(null)
      setCrop(undefined)
      setCompletedCrop(undefined)
      setError(null)
      return
    }
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function onImageLoad(e) {
    const { naturalWidth, naturalHeight } = e.currentTarget
    const initial = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, TARGET_ASPECT, naturalWidth, naturalHeight),
      naturalWidth,
      naturalHeight,
    )
    setCrop(initial)
  }

  async function renderCroppedJpeg() {
    if (!imgRef.current || !completedCrop || !file) {
      throw new Error('Crop not ready.')
    }
    const image = imgRef.current
    const { width: cropW, height: cropH, x: cropX, y: cropY } = completedCrop

    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height
    const outW = Math.round(cropW * scaleX)
    const outH = Math.round(cropH * scaleY)

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get canvas context.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      image,
      cropX * scaleX,
      cropY * scaleY,
      cropW * scaleX,
      cropH * scaleY,
      0,
      0,
      outW,
      outH,
    )

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not encode crop.'))),
        'image/jpeg',
        OUTPUT_QUALITY,
      )
    })

    const baseName = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  }

  async function handleConfirm() {
    setError(null)
    setBusy(true)
    try {
      const cropped = await renderCroppedJpeg()
      onConfirm(cropped)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save crop.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened={!!file} onClose={onCancel} title={<Text fw={700} size="sm">Crop photo (4:3)</Text>} size="lg" centered>
      {label && (
        <Text size="xs" c="dimmed" mb={8}>
          Label: <Text component="span" fw={600} c="inherit">{label}</Text>
        </Text>
      )}
      {error && (
        <Text size="xs" c="#d32129" mb={8} p={6} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4 }}>
          {error}
        </Text>
      )}
      {imageUrl && (
        <Box style={{ background: 'var(--mantine-color-gray-1)', display: 'flex', justifyContent: 'center', maxHeight: '65vh' }}>
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={TARGET_ASPECT}
            keepSelection
            minWidth={50}
          >
            <img ref={imgRef} src={imageUrl} alt="Crop source" onLoad={onImageLoad} style={{ maxHeight: '65vh', display: 'block' }} />
          </ReactCrop>
        </Box>
      )}

      <Text size="10px" c="dimmed" mt={8} mb={4}>
        Drag the box to reposition · drag handles to resize · ratio locked to 4:3.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" size="xs" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          size="xs"
          onClick={handleConfirm}
          disabled={busy || !completedCrop}
          style={{ background: '#0F2744', border: 'none' }}
        >
          {busy ? 'Saving…' : 'Use this crop'}
        </Button>
      </Group>
    </Modal>
  )
}
