import { Box, SimpleGrid, Text, TextInput, Group, Badge } from '@mantine/core'
import { IconPhoto } from '@tabler/icons-react'
import { useState } from 'react'
import { SAMPLE_PHOTOS } from '../../../data/reportEditorSampleData'

export default function PhotosTab() {
  const [photos, setPhotos] = useState(SAMPLE_PHOTOS)
  const acceptedCount = photos.filter((p) => p.uploaded && p.label).length

  return (
    <Box>
      <Group justify="space-between" mb={12}>
        <Text size="sm">{acceptedCount} of 2 photos complete</Text>
        <Text size="xs" c="dimmed">JPEG / PNG / HEIC · 10 MB max</Text>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {photos.map((p) => (
          <Box key={p.slot} p={16} style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8 }}>
            <Group justify="space-between" mb={8}>
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">Photo {p.slot}</Text>
              {p.uploaded ? <Badge size="xs" color="green">Uploaded</Badge> : <Badge size="xs" color="gray">Empty</Badge>}
            </Group>
            <Box
              h={140}
              mb={10}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--mantine-color-gray-0)', borderRadius: 6,
              }}
            >
              <IconPhoto size={32} color="var(--mantine-color-gray-5)" />
            </Box>
            <TextInput
              size="xs"
              placeholder="Photo label"
              value={p.label}
              onChange={(e) => setPhotos((prev) => prev.map((x) => (x.slot === p.slot ? { ...x, label: e.currentTarget.value } : x)))}
            />
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  )
}
