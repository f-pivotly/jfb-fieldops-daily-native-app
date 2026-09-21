import { Box, Table, Text, TextInput } from '@mantine/core'
import { comboNOH, isUnassigned } from '../../../../lib/productionCombos'
import { computeAvgFace } from '../../../../lib/productionValues'

function tscaLabel(tsca) {
  if (tsca === true) return 'Yes'
  if (tsca === false) return 'No'
  return '—'
}

export default function DredgeProductionTable({
  combos,
  totals,
  hasSubArea,
  hasSubSubArea,
  cellValue,
  setCellValue,
  commitCell,
}) {
  if (combos.length === 0) {
    return (
      <Box p={24} style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8, textAlign: 'center' }}>
        <Text size="sm" fw={500}>No production rows yet.</Text>
        <Text size="xs" c="dimmed" mt={4}>
          Rows appear once operator events log time with an area for this equipment.
        </Text>
      </Box>
    )
  }

  return (
    <Table withTableBorder verticalSpacing="xs" fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Area</Table.Th>
          {hasSubArea && <Table.Th>Sub-Area</Table.Th>}
          {hasSubSubArea && <Table.Th>Sub-Sub-Area</Table.Th>}
          <Table.Th>Pass</Table.Th>
          <Table.Th>TSCA</Table.Th>
          <Table.Th ta="right">GOH</Table.Th>
          <Table.Th ta="right">NOH</Table.Th>
          <Table.Th ta="right">CY</Table.Th>
          <Table.Th ta="right">SF</Table.Th>
          <Table.Th ta="right">Avg Face Ft *</Table.Th>
          <Table.Th>Notes</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {combos.map((c) => (
          <Table.Tr key={c.key} style={isUnassigned(c) ? { background: 'var(--mantine-color-yellow-0)' } : undefined}>
            <Table.Td>{isUnassigned(c) ? <Text span fs="italic" c="orange.8">Unassigned</Text> : (c.areaLabel ?? '—')}</Table.Td>
            {hasSubArea && <Table.Td>{c.subAreaLabel ?? '—'}</Table.Td>}
            {hasSubSubArea && <Table.Td>{c.subSubAreaLabel ?? '—'}</Table.Td>}
            <Table.Td c="dimmed">{c.passLabel ?? '—'}</Table.Td>
            <Table.Td c="dimmed">{tscaLabel(c.tsca)}</Table.Td>
            <Table.Td ta="right" c="dimmed">{c.timeHours.toFixed(2)}</Table.Td>
            <Table.Td ta="right" c="dimmed">{comboNOH(c).toFixed(2)}</Table.Td>
            <Table.Td>
              <TextInput
                size="xs"
                ta="right"
                value={cellValue(c, 'volume')}
                onChange={(e) => setCellValue(c, 'volume', e.currentTarget.value)}
                onBlur={() => commitCell(c, 'volume', 1)}
              />
            </Table.Td>
            <Table.Td>
              <TextInput
                size="xs"
                ta="right"
                value={cellValue(c, 'area')}
                onChange={(e) => setCellValue(c, 'area', e.currentTarget.value)}
                onBlur={() => commitCell(c, 'area', 0)}
              />
            </Table.Td>
            <Table.Td ta="right" c="dimmed">
              {(() => {
                const face = computeAvgFace(cellValue(c, 'volume'), cellValue(c, 'area'))
                return face != null ? face.toFixed(2) : '—'
              })()}
            </Table.Td>
            <Table.Td>
              <TextInput
                size="xs"
                value={cellValue(c, 'notes')}
                onChange={(e) => setCellValue(c, 'notes', e.currentTarget.value)}
                onBlur={() => commitCell(c, 'notes', null)}
              />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr>
          <Table.Td colSpan={3 + (hasSubArea ? 1 : 0) + (hasSubSubArea ? 1 : 0)} fw={700}>Totals</Table.Td>
          <Table.Td ta="right" fw={700}>{totals.goh.toFixed(2)}</Table.Td>
          <Table.Td ta="right" fw={700}>{totals.noh.toFixed(2)}</Table.Td>
          <Table.Td ta="right" fw={700}>{totals.cy.toFixed(1)}</Table.Td>
          <Table.Td ta="right" fw={700}>{totals.sf.toFixed(0)}</Table.Td>
          <Table.Td ta="right" fw={700}>{totals.faceCount > 0 ? (totals.face / totals.faceCount).toFixed(2) : '—'}</Table.Td>
          <Table.Td />
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  )
}
