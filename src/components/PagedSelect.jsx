import { useState } from 'react'
import { Combobox, InputBase, useCombobox, Group, Text, Pagination } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { FETCH_PAGE_SIZE } from '../constants/pagination'

export default function PagedSelect({ data, value, onChange, pageSize = FETCH_PAGE_SIZE, nothingFoundMessage = 'Nothing found', noun = 'option', plural = `${noun}s`, disabled, ...inputProps }) {
  const [search, setSearch] = useState(null)
  const [page, setPage] = useState(1)
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
      setSearch(null)
      setPage(1)
    },
  })

  const selected = data.find((o) => o.value === value) ?? null
  const query = (search ?? '').trim().toLowerCase()
  const filtered = query ? data.filter((o) => o.label.toLowerCase().includes(query)) : data
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, totalPages)
  const pageItems = filtered.slice((current - 1) * pageSize, current * pageSize)
  const first = (current - 1) * pageSize + 1
  const last = first + pageItems.length - 1

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(v) => {
        onChange(v)
        combobox.closeDropdown()
      }}
    >
      <Combobox.Target>
        <InputBase
          {...inputProps}
          disabled={disabled}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          value={search ?? selected?.label ?? ''}
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
          {pageItems.length === 0 ? (
            <Combobox.Empty>{nothingFoundMessage}</Combobox.Empty>
          ) : (
            pageItems.map((o) => (
              <Combobox.Option value={o.value} key={o.value}>
                <Group gap={6} wrap="nowrap">
                  {o.value === value && <IconCheck size={12} />}
                  <span>{o.label}</span>
                </Group>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
        {filtered.length > 0 && (
          <Combobox.Footer onMouseDown={(e) => e.preventDefault()}>
            <Group justify="space-between" wrap="nowrap" gap={8}>
              <Text size="xs" c="dimmed">
                {first}–{last} of {filtered.length} {filtered.length === 1 ? noun : plural}
              </Text>
              <Pagination size="xs" value={current} onChange={setPage} total={totalPages} />
            </Group>
          </Combobox.Footer>
        )}
      </Combobox.Dropdown>
    </Combobox>
  )
}
