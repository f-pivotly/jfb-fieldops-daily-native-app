import { Box, Button, FileButton, Group, Text } from '@mantine/core'
import UploadedFile from './UploadedFile'
import StagedFilePreview from './StagedFilePreview'

export default function ChartFileControl({
  accept,
  label,
  onChange,
  uploading,
  fileId,
  fileName,
  staged,
  error,
  onUnstage,
  onRemove,
  removing,
}) {
  const showSaved = !!fileId && !uploading && !staged
  const showStaged = !!staged && !uploading
  return (
    <Box>
      {label && <Text size="xs" c="black" fw={700} mb={4}>{label}</Text>}
      <Group gap={8} align="center">
        <FileButton onChange={onChange ?? (() => {})} accept={accept}>
          {(props) => (
            <Button {...props} variant="default" size="xs" loading={uploading}>
              {showSaved ? 'Replace File' : 'Choose File'}
            </Button>
          )}
        </FileButton>
        {showSaved && onRemove && (
          <Button size="xs" variant="subtle" color="red" loading={removing} onClick={onRemove}>Remove</Button>
        )}
        {showStaged && onUnstage && (
          <Button size="xs" variant="subtle" color="gray" onClick={onUnstage}>Undo</Button>
        )}
        {!showSaved && !showStaged && !uploading && (
          <Text size="xs" c="dimmed">No file uploaded</Text>
        )}
      </Group>
      {(showSaved || showStaged) && (
        <Box mt={6}>
          {showSaved && <UploadedFile key={fileId} fileId={fileId} fileName={fileName} />}
          {showStaged && <StagedFilePreview file={staged.file} name={staged.originalName} />}
        </Box>
      )}
      {error && <Text size="10px" c="red" mt={2}>{error}</Text>}
    </Box>
  )
}
