import { useEffect, useState } from 'react'
import { Group, Image, Text } from '@mantine/core'
import { fetchFileById, downloadAttachment } from '../../../../data'

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i

// The stored file can differ from what the user picked -- an isopach CSV is
// converted to a PNG on upload -- so the server's mime type decides, not the name.
function isImage(meta) {
  if (meta?.mimeType) return meta.mimeType.startsWith('image/')
  return IMAGE_EXT.test(meta?.logicalName ?? '')
}

export default function UploadedFile({ fileId, fileName }) {
  const [fetchedName, setFetchedName] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    if (!fileId) return
    let cancelled = false
    let objectUrl = null

    async function resolve() {
      const meta = await fetchFileById(fileId)
      if (cancelled) return
      setFetchedName(meta?.logicalName ?? null)
      if (!isImage(meta)) return

      const blob = await downloadAttachment(fileId)
      const url = URL.createObjectURL(blob)
      if (cancelled) {
        URL.revokeObjectURL(url)
        return
      }
      objectUrl = url
      setPreviewUrl(url)
    }

    resolve().catch(() => {})

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileId])

  if (!fileId) return null

  const displayName = fileName ?? fetchedName

  return (
    <Group gap={6} align="center" wrap="nowrap">
      {previewUrl && (
        <Image
          src={previewUrl}
          alt={displayName ?? 'Uploaded image'}
          h={36}
          w="auto"
          fit="contain"
          radius={2}
          style={{ border: '1px solid var(--mantine-color-gray-3)' }}
        />
      )}
      <Text size="xs" c="teal" lineClamp={1} title={displayName ?? undefined}>
        {displayName ?? 'Uploaded'}
      </Text>
    </Group>
  )
}
