import { Box, Text, useMantineTheme } from '@mantine/core'
import { usePicklist } from '../hooks/usePicklist'
import { TONE_STATUS_KEY, toneFor } from '../helpers/statusTone'

export default function StatusPill({ val, slug, fontSize = 9 }) {
  const theme = useMantineTheme()
  const { labels } = usePicklist(slug)
  if (!val) return <Text component="span" c="#ccc" style={{ fontSize }}>—</Text>
  const label = slug ? (labels[val] ?? val) : val
  const s = theme.other.status[TONE_STATUS_KEY[toneFor(val)]]
  return (
    <Box component="span" style={{ fontSize, fontWeight: 700, letterSpacing: '.4px', padding: '2px 6px', borderRadius: 3, background: s.bg, color: s.fg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {label}
    </Box>
  )
}
