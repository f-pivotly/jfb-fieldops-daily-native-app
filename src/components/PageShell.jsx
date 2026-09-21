import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Box, ScrollArea } from '@mantine/core'

export const PAGE_PADDING = 24

export default function PageShell({ children }) {
  const viewportRef = useRef(null)
  const { pathname } = useLocation()

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <ScrollArea flex={1} viewportRef={viewportRef} style={{ minHeight: 0 }}>
      <Box p={PAGE_PADDING}>{children}</Box>
    </ScrollArea>
  )
}
