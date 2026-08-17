import { Box, SimpleGrid, Text, TextInput, Group, Badge, FileButton } from '@mantine/core'
import { IconPhoto, IconRefresh } from '@tabler/icons-react'
import { useState } from 'react'
import CropDialog from '../../../components/CropDialog'
import { SAMPLE_PHOTOS } from '../../../data/reportEditorSampleData'

export default function PhotosTab() {
  const [photos, setPhotos] = useState(SAMPLE_PHOTOS.map((p) => ({ ...p, previewUrl: null })))
  const [cropSlot, setCropSlot] = useState(null)
  const [cropFile, setCropFile] = useState(null)
  const acceptedCount = photos.filter((p) => p.uploaded && p.label).length

  function pickFile(slot, file) {
    if (!file) return
    setCropSlot(slot)
    setCropFile(file)
  }

  function handleCropSave(previewUrl) {
    setPhotos((prev) => prev.map((x) => (x.slot === cropSlot ? { ...x, previewUrl, uploaded: true, rejected: false } : x)))
    setCropSlot(null)
    setCropFile(null)
  }

  function handleCropCancel() {
    setCropSlot(null)
    setCropFile(null)
  }

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

            {p.previewUrl ? (
              <Box
                h={140}
                mb={10}
                style={{
                  backgroundImage: `url(${p.previewUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderRadius: 6,
                  position: 'relative',
                }}
              >
                <FileButton onChange={(file) => pickFile(p.slot, file)} accept="image/png,image/jpeg,image/heic,image/heif">
                  {(props) => (
                    <Group
                      {...props}
                      gap={4}
                      style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                    >
                      <IconRefresh size={11} /> Replace
                    </Group>
                  )}
                </FileButton>
              </Box>
            ) : (
              <FileButton onChange={(file) => pickFile(p.slot, file)} accept="image/png,image/jpeg,image/heic,image/heif">
                {(props) => (
                  <Box
                    {...props}
                    h={140}
                    mb={10}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--mantine-color-gray-0)', borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    <IconPhoto size={32} color="var(--mantine-color-gray-5)" />
                  </Box>
                )}
              </FileButton>
            )}

            <TextInput
              size="xs"
              placeholder="Photo label"
              value={p.label}
              onChange={(e) => setPhotos((prev) => prev.map((x) => (x.slot === p.slot ? { ...x, label: e.currentTarget.value } : x)))}
            />
          </Box>
        ))}
      </SimpleGrid>

      {cropFile && <CropDialog file={cropFile} onCancel={handleCropCancel} onSave={handleCropSave} />}
    </Box>
  )
}
