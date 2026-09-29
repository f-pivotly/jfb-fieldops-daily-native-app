import { useEffect, useState } from 'react'
import { Anchor, Box, Group, Image, Text } from '@mantine/core'
import { fetchFileById, downloadAttachment } from '../../../../data'

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i

// The stored file can differ from what the user picked -- an isopach CSV is
// converted to a PNG on upload -- so the server's mime type decides, not the name.
function isImage(meta) {
  if (meta?.mimeType) return meta.mimeType.startsWith('image/')
  return IMAGE_EXT.test(meta?.logicalName ?? '')
}

export default function UploadedFile({ fileId, fileName, size = 'large' }) {
  const [fetchedName, setFetchedName] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [downloading, setDownloading] = useState(false)

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

  async function handleDownload() {
    setDownloading(true)
    try {
      const blob = await downloadAttachment(fileId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = displayName || 'file'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Could not download the file:', err.message)
    } finally {
      setDownloading(false)
    }
  }

  const nameRow = (
    <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
      <Text size="xs" c="teal" lineClamp={1} title={displayName ?? undefined}>
        {displayName ?? 'Uploaded'}
      </Text>
      <Anchor component="button" type="button" size="xs" onClick={handleDownload} disabled={downloading} style={{ whiteSpace: 'nowrap' }}>
        {downloading ? 'Downloading…' : 'Download'}
      </Anchor>
    </Group>
  )

  if (size === 'thumb') {
    return (
      <Group gap={6} align="center" wrap="nowrap" style={{ minWidth: 0 }}>
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
        {nameRow}
      </Group>
    )
  }

  return (
    <Box style={{ minWidth: 0 }}>
      {nameRow}
      {previewUrl && (
        <Anchor href={previewUrl} target="_blank" rel="noreferrer" title="Open full size">
          <Image
            src={previewUrl}
            alt={displayName ?? 'Uploaded image'}
            mah={180}
            maw="100%"
            w="auto"
            fit="contain"
            radius={4}
            mt={6}
            style={{ border: '1px solid var(--mantine-color-gray-3)', background: '#fff' }}
          />
        </Anchor>
      )}
    </Box>
  )
}
