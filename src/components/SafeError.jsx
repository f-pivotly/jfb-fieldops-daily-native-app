import { Text } from '@mantine/core'

export default function SafeError({ message, size = 'xs', ...rest }) {
  if (!message) return null
  return (
    <Text size={size} c="#ef4444" {...rest}>
      {message}
    </Text>
  )
}
