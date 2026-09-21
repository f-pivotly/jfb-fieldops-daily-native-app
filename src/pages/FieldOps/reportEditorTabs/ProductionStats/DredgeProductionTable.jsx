import { Box, Table, Text, TextInput } from '@mantine/core'
import SaveIndicator from '../../../../components/SaveIndicator'
import { comboNOH, isUnassigned } from '../../../../lib/productionCombos'
import { computeAvgFace, fmt } from '../../../../lib/productionValues'

const NEEDS_VALUE_STYLES = { input: { backgroundColor: '#fefce8', borderColor: '#fde047' } }

function tscaLabel(tsca) {
  if (tsca === true) return 'Yes'
  if (tsca === false) return 'No'
  return '—'
}

export default function DredgeProductionTable({
  combos,
  totals,
  areaLabels = [],
  useTsca,
  cellValue,
  setCellValue,
  flushCell,
  saveState = {},
}) {
  if (combos.length === 0) {
    return (
      <Box p={24} style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8, textAlign: 'center' }}>
        <Text size="sm" fw={500}>No production rows yet.</Text>
        <Text size="xs" c="dimmed" mt={4}>
          Rows appear once operator events log time with an area for this equipment. Insert transition
          events from the Event Log tab to attribute time to specific Area + Pass combinations.
        </Text>
      </Box>
    )
  }

  const subLabel = areaLabels[1] ?? null
  const subSubLabel = areaLabels[2] ?? null

  return (
    <Table withTableBorder verticalSpacing="xs" fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{areaLabels[0] ?? 'Area'}</Table.Th>
          {subLabel && <Table.Th>{subLabel}</Table.Th>}
          {subSubLabel && <Table.Th>{subSubLabel}</Table.Th>}
          <Table.Th>Pass</Table.Th>
          {useTsca && <Table.Th>TSCA</Table.Th>}
          <Table.Th ta="right" title="Gross Operating Hours — total event time on this combo">GOH</Table.Th>
          <Table.Th ta="right" title="Net Operating Hours — productive events only">NOH</Table.Th>
          <Table.Th ta="right">CY</Table.Th>
          <Table.Th ta="right">SF</Table.Th>
          <Table.Th ta="right">Avg Face ft *</Table.Th>
          <Table.Th>Notes</Table.Th>
          <Table.Th style={{ width: 72 }} />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {combos.map((c) => {
          const volume = cellValue(c, 'volume')
          const area = cellValue(c, 'area')
          const face = computeAvgFace(volume, area)
          return (
            <Table.Tr key={c.key} style={isUnassigned(c) ? { background: 'var(--mantine-color-yellow-0)' } : undefined}>
              <Table.Td>{isUnassigned(c) ? <Text span fs="italic" c="orange.8">Unassigned</Text> : (c.areaLabel ?? '—')}</Table.Td>
              {subLabel && <Table.Td>{c.subAreaLabel ?? '—'}</Table.Td>}
              {subSubLabel && <Table.Td>{c.subSubAreaLabel ?? '—'}</Table.Td>}
              <Table.Td c="dimmed">{c.passLabel ?? '—'}</Table.Td>
              {useTsca && <Table.Td c="dimmed">{tscaLabel(c.tsca)}</Table.Td>}
              <Table.Td ta="right" c="dimmed">{fmt(c.timeHours, 2)}</Table.Td>
              <Table.Td ta="right" c="dimmed">{fmt(comboNOH(c), 2)}</Table.Td>
              <Table.Td>
                <TextInput
                  size="xs"
                  ta="right"
                  styles={volume === '' ? NEEDS_VALUE_STYLES : undefined}
                  value={volume}
                  onChange={(e) => setCellValue(c, 'volume', e.currentTarget.value)}
                  onBlur={() => flushCell(c.key)}
                />
              </Table.Td>
              <Table.Td>
                <TextInput
                  size="xs"
                  ta="right"
                  styles={area === '' ? NEEDS_VALUE_STYLES : undefined}
                  value={area}
                  onChange={(e) => setCellValue(c, 'area', e.currentTarget.value)}
                  onBlur={() => flushCell(c.key)}
                />
              </Table.Td>
              <Table.Td ta="right">
                <Box
                  component="span"
                  title="Calculated: (CY × 27) / SF, in feet"
                  style={{
                    display: 'inline-block',
                    minWidth: 64,
                    padding: '2px 6px',
                    border: '1px dashed var(--mantine-color-gray-4)',
                    borderRadius: 4,
                    background: 'var(--mantine-color-gray-0)',
                    color: 'var(--mantine-color-dimmed)',
                  }}
                >
                  {fmt(face, 2)}
                </Box>
              </Table.Td>
              <Table.Td>
                <TextInput
                  size="xs"
                  value={cellValue(c, 'notes')}
                  onChange={(e) => setCellValue(c, 'notes', e.currentTarget.value)}
                  onBlur={() => flushCell(c.key)}
                />
              </Table.Td>
              <Table.Td>
                <SaveIndicator state={saveState[c.key]} />
              </Table.Td>
            </Table.Tr>
          )
        })}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr>
          <Table.Td colSpan={2 + (subLabel ? 1 : 0) + (subSubLabel ? 1 : 0) + (useTsca ? 1 : 0)} fw={700}>Totals</Table.Td>
          <Table.Td ta="right" fw={700}>{fmt(totals.goh, 2)}</Table.Td>
          <Table.Td ta="right" fw={700}>{fmt(totals.noh, 2)}</Table.Td>
          <Table.Td ta="right" fw={700}>{fmt(totals.cy, 1)}</Table.Td>
          <Table.Td ta="right" fw={700}>{fmt(totals.sf, 1)}</Table.Td>
          <Table.Td ta="right" fw={700}>{totals.faceCount > 0 ? fmt(totals.face / totals.faceCount, 2) : '—'}</Table.Td>
          <Table.Td />
          <Table.Td />
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  )
}
