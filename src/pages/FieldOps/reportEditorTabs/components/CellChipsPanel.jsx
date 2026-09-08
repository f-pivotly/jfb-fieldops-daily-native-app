import { Button, Chip, Group, Text } from '@mantine/core'

export default function CellChipsPanel({
  cellsList,
  activeCellLabels,
  onActiveCellLabelsChange,
  onApplyActiveCells,
  dataSource,
  isCellEffectivelyComplete,
  toggleCellComplete,
  cellStatusBusy,
}) {
  if (cellsList.length === 0) return null
  const labeledCells = cellsList.filter((c) => c.label)

  return (
    <>
      <Group gap={8} align="center" mt={12} wrap="wrap">
        <Text size="xs" c="dimmed">Worked today (blank = all cells):</Text>
        {labeledCells.map((c) => (
          <Chip
            key={c.label}
            size="xs"
            checked={activeCellLabels.includes(c.label)}
            onChange={(checked) => onActiveCellLabelsChange((prev) => (
              checked ? [...prev, c.label] : prev.filter((l) => l !== c.label)
            ))}
          >
            {c.label}
          </Chip>
        ))}
        <Button size="xs" variant="default" onClick={onApplyActiveCells}>Apply</Button>
        {activeCellLabels.length > 0 && (
          <Button size="xs" variant="subtle" onClick={() => onActiveCellLabelsChange([])}>clear (then Apply)</Button>
        )}
      </Group>
      {dataSource !== 'earthworks' && (
        <Group gap={8} align="center" mt={12} wrap="wrap">
          <Text size="xs" c="dimmed">Completed CSCs (work there = residual):</Text>
          {labeledCells.map((c) => (
            <Chip
              key={c.label}
              size="xs"
              disabled={cellStatusBusy}
              checked={isCellEffectivelyComplete(c.label)}
              onChange={() => toggleCellComplete(c.label)}
            >
              {c.label}
            </Chip>
          ))}
          <Text size="xs" c="dimmed">gray chip = complete as of this date; dredging inside it charts as residual, not 2nd pass</Text>
        </Group>
      )}
    </>
  )
}
