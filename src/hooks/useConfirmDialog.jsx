import { useRef, useState } from 'react'
import { Modal, Text, Group, Button } from '@mantine/core'

// window.confirm() is silently blocked in this app's hosting iframe (its
// sandbox attribute has no allow-modals -- Portal_Independent_Frontend's
// src/app/applications/[app_slug]/index.js): it just returns false with no
// dialog and no error, which makes any "if (!confirm(...)) return" button
// look dead. Use this in-app modal instead of depending on a browser dialog
// API at all -- same call shape as window.confirm (await it for a boolean)
// so call sites barely change.
export function useConfirmDialog() {
  const [message, setMessage] = useState(null)
  const resolverRef = useRef(null)

  function confirm(text) {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setMessage(text)
    })
  }

  function settle(result) {
    setMessage(null)
    resolverRef.current?.(result)
    resolverRef.current = null
  }

  const modal = (
    <Modal opened={message !== null} onClose={() => settle(false)} title={<Text fw={700} size="sm">Confirm</Text>} size="sm">
      <Text size="sm" mb={16}>{message}</Text>
      <Group justify="flex-end">
        <Button size="xs" variant="default" onClick={() => settle(false)}>Cancel</Button>
        <Button size="xs" color="red" onClick={() => settle(true)}>Confirm</Button>
      </Group>
    </Modal>
  )

  return { confirm, modal }
}
