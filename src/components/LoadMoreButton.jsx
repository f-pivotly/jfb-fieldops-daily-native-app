import { Group, Text, Button } from '@mantine/core'

export default function LoadMoreButton({ count, hasMore, onClick, loading = false, noun = 'row', mt = 12, mb = 0 }) {
  if (!count) return null
  return (
    <Group justify="center" mt={mt} mb={mb} gap={12}>
      <Text size="xs" c="dimmed">
        {hasMore ? `Showing ${count}` : `${count} ${noun}${count === 1 ? '' : 's'}`}
      </Text>
      {hasMore && (
        <Button size="xs" variant="default" loading={loading} onClick={onClick}>Load more</Button>
      )}
    </Group>
  )
}
