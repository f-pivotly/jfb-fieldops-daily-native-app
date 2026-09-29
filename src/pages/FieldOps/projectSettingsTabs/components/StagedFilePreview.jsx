import { useEffect, useMemo } from 'react'
import { Box, Group, Image, Text } from '@mantine/core'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function StagedFilePreview({ file, name, size = 'large' }) {
  const previewUrl = useMemo(
    () => (file?.type?.startsWith('image/') ? URL.createObjectURL(file) : null),
    [file],
  )

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  if (!file) return null

  const displayName = name ?? file.name
  const label = (
    <Text size="xs" c="orange" lineClamp={1} title={displayName}>
      {displayName} · {formatSize(file.size)} — staged, uploads on Save
    </Text>
  )

  if (size === 'thumb') {
    return (
      <Group gap={6} align="center" wrap="nowrap" style={{ minWidth: 0 }}>
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
        {label}
      </Group>
    )
  }

  return (
    <Box style={{ minWidth: 0 }}>
      {label}
      {previewUrl && (
        <Image
          src={previewUrl}
          alt={displayName}
          mah={180}
          maw="100%"
          w="auto"
          fit="contain"
          radius={4}
          mt={6}
          style={{ border: '1px solid var(--mantine-color-orange-3)', background: '#fff' }}
        />
      )}
    </Box>
  )
}
