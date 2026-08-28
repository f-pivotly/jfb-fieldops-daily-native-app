import { useRef, useState } from 'react'
import { Modal, Text, Group, Button } from '@mantine/core'

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
