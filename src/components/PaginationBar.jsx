import { Group, Text, Pagination } from '@mantine/core'

export default function PaginationBar({ page, pageSize, count, total = null, hasNext = false, onChange, noun = 'row', plural = `${noun}s`, mt = 12, mb = 0, disabled = false }) {
  if (!count && page === 1) return null
  const totalPages = total != null ? Math.max(1, Math.ceil(total / pageSize)) : page + (hasNext ? 1 : 0)
  const first = (page - 1) * pageSize + 1
  const last = first + count - 1
  const label = total != null
    ? `${first}–${last} of ${total} ${total === 1 ? noun : plural}`
    : `${first}–${last} ${last === 1 ? noun : plural}`
  return (
    <Group justify="space-between" mt={mt} mb={mb} gap={12}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Pagination size="sm" value={page} onChange={onChange} total={totalPages} disabled={disabled} />
    </Group>
  )
}
