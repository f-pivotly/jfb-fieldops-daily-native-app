import { Box, Table, TextInput, Text } from '@mantine/core'
import { useState } from 'react'
import { SAMPLE_PRODUCTION_ROWS, SAMPLE_PRODUCTION_TOTALS } from '../../../data/reportEditorSampleData'

export default function ProductionStatsTab() {
  const [rows, setRows] = useState(SAMPLE_PRODUCTION_ROWS)
  const t = SAMPLE_PRODUCTION_TOTALS

  function update(key, field, raw) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: raw === '' ? null : Number(raw) } : r)))
  }

  return (
    <Table withTableBorder verticalSpacing="xs" fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Area</Table.Th>
          <Table.Th>Pass</Table.Th>
          <Table.Th ta="right">GOH</Table.Th>
          <Table.Th ta="right">NOH</Table.Th>
          <Table.Th ta="right">CY</Table.Th>
          <Table.Th ta="right">SF</Table.Th>
          <Table.Th ta="right">Avg Face ft</Table.Th>
          <Table.Th>Notes</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.key}>
            <Table.Td>{r.area}</Table.Td>
            <Table.Td>{r.pass}</Table.Td>
            <Table.Td ta="right">{r.goh.toFixed(2)}</Table.Td>
            <Table.Td ta="right">{r.noh.toFixed(2)}</Table.Td>
            <Table.Td>
              <TextInput size="xs" ta="right" value={r.cy ?? ''} onChange={(e) => update(r.key, 'cy', e.currentTarget.value)} />
            </Table.Td>
            <Table.Td>
              <TextInput size="xs" value={r.sf ?? ''} onChange={(e) => update(r.key, 'sf', e.currentTarget.value)} />
            </Table.Td>
            <Table.Td ta="right">
              <Text size="sm" c="dimmed">{r.avgFace ?? '—'}</Text>
            </Table.Td>
            <Table.Td>
              <TextInput size="xs" value={r.notes} onChange={(e) => update(r.key, 'notes', e.currentTarget.value)} />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr>
          <Table.Th colSpan={2}>Totals</Table.Th>
          <Table.Th ta="right">{t.goh.toFixed(2)}</Table.Th>
          <Table.Th ta="right">{t.noh.toFixed(2)}</Table.Th>
          <Table.Th ta="right">{t.cy}</Table.Th>
          <Table.Th ta="right">{t.sf}</Table.Th>
          <Table.Th ta="right">{t.avgFace}</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  )
}
