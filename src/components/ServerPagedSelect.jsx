import { useEffect, useRef, useState } from 'react'
import { Combobox, InputBase, useCombobox, Group, Text, Pagination, Loader } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconCheck } from '@tabler/icons-react'
import { FETCH_PAGE_SIZE } from '../constants/pagination'

export default function ServerPagedSelect({ fetchPage, reloadKey = '', value, selectedLabel, onChange, pageSize = FETCH_PAGE_SIZE, nothingFoundMessage = 'Nothing found', noun = 'option', plural = `${noun}s`, disabled, ...inputProps }) {
  const [search, setSearch] = useState(null)
  const [page, setPage] = useState(1)
  const [opened, setOpened] = useState(false)
  const [result, setResult] = useState({ key: null, items: [], hasNext: false, error: null })
  const [debouncedSearch] = useDebouncedValue((search ?? '').trim(), 300)
  const fetchPageRef = useRef(fetchPage)

  useEffect(() => {
    fetchPageRef.current = fetchPage
  })

  const combobox = useCombobox({
    onDropdownOpen: () => setOpened(true),
    onDropdownClose: () => {
      combobox.resetSelectedOption()
      setOpened(false)
      setSearch(null)
      setPage(1)
    },
  })

  const requestKey = `${reloadKey}|${debouncedSearch}|${page}|${pageSize}`

  useEffect(() => {
    if (!opened) return
    let cancelled = false
    fetchPageRef.current({ search: debouncedSearch, page, pageSize })
      .then(({ items, hasNext }) => {
        if (!cancelled) setResult({ key: requestKey, items, hasNext, error: null })
      })
      .catch((err) => {
        if (!cancelled) setResult({ key: requestKey, items: [], hasNext: false, error: err.message })
      })
    return () => { cancelled = true }
  }, [opened, requestKey, debouncedSearch, page, pageSize])

  const loading = opened && result.key !== requestKey
  const items = result.key === requestKey ? result.items : []
  const hasNext = result.key === requestKey && result.hasNext
  const first = (page - 1) * pageSize + 1
  const last = first + items.length - 1

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(v) => {
        const item = items.find((o) => o.value === v)
        if (item?.disabled) return
        onChange(v, item ?? null)
        combobox.closeDropdown()
      }}
    >
      <Combobox.Target>
        <InputBase
          {...inputProps}
          disabled={disabled}
          rightSection={loading ? <Loader size={12} /> : <Combobox.Chevron />}
          rightSectionPointerEvents="none"
          value={search ?? selectedLabel ?? ''}
          onChange={(e) => {
            setSearch(e.currentTarget.value)
            setPage(1)
            combobox.openDropdown()
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {!loading && result.error && <Combobox.Empty>{result.error}</Combobox.Empty>}
          {!loading && !result.error && items.length === 0 && <Combobox.Empty>{nothingFoundMessage}</Combobox.Empty>}
          {items.map((o) => (
            <Combobox.Option value={o.value} key={o.value} disabled={o.disabled}>
              <Group gap={6} wrap="nowrap">
                {o.value === value && <IconCheck size={12} />}
                <span>{o.label}</span>
                {o.note && <Text span size="xs" c="dimmed">{o.note}</Text>}
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
        {(items.length > 0 || page > 1) && (
          <Combobox.Footer onMouseDown={(e) => e.preventDefault()}>
            <Group justify="space-between" wrap="nowrap" gap={8}>
              <Text size="xs" c="dimmed">
                {items.length ? `${first}–${last} ${last === 1 ? noun : plural}` : ''}
              </Text>
              <Pagination size="xs" value={page} onChange={setPage} total={page + (hasNext ? 1 : 0)} disabled={loading} />
            </Group>
          </Combobox.Footer>
        )}
      </Combobox.Dropdown>
    </Combobox>
  )
}
