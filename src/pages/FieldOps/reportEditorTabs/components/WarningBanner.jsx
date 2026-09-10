import { Box } from '@mantine/core'

export const WARNING_BG = '#fbf1dd'
export const WARNING_BORDER = '#e6cb87'
export const WARNING_TEXT = '#7a5206'

export default function WarningBanner({ children, ...boxProps }) {
  return (
    <Box style={{ background: WARNING_BG, border: `1px solid ${WARNING_BORDER}`, borderRadius: 6 }} {...boxProps}>
      {children}
    </Box>
  )
}
