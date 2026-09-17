import { useEffect, useMemo } from 'react'
import { Group, Image, Text } from '@mantine/core'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function StagedFilePreview({ file, name }) {
  const previewUrl = useMemo(
    () => (file?.type?.startsWith('image/') ? URL.createObjectURL(file) : null),
    [file],
  )

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  if (!file) return null

  const displayName = name ?? file.name

  return (
    <Group gap={6} align="center" wrap="nowrap">
      {previewUrl && (
        <Image
          src={previewUrl}
          alt={displayName}
          h={36}
          w="auto"
          fit="contain"
          radius={2}
          style={{ border: '1px solid var(--mantine-color-orange-3)' }}
        />
      )}
      <Text size="xs" c="orange" lineClamp={1} title={displayName}>
        {displayName} · {formatSize(file.size)} — staged, uploads on Save
      </Text>
    </Group>
  )
}
