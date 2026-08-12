import { Box, Text, Textarea, Stack } from '@mantine/core'
import { useState } from 'react'
import { SAMPLE_NARRATIVE_SECTIONS } from '../../../data/reportEditorSampleData'

export default function NarrativesTab() {
  const [sections, setSections] = useState(SAMPLE_NARRATIVE_SECTIONS)

  return (
    <Stack gap="md">
      {sections.map((s) => (
        <Box key={s.key} p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
          <Text size="sm" fw={600} mb={8}>{s.label}</Text>
          <Textarea
            autosize
            minRows={2}
            value={s.content}
            onChange={(e) =>
              setSections((prev) => prev.map((x) => (x.key === s.key ? { ...x, content: e.currentTarget.value } : x)))
            }
          />
        </Box>
      ))}
    </Stack>
  )
}
