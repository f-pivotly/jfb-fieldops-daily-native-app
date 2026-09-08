import { Box, Table, Text } from '@mantine/core'
import { impliedThicknessFt } from '../../../../lib/dredge/designVolume'

export default function ChartStatsSummary({ lastResult, priorAdvanceFt, refSurfaceError, saved, notice, dateWarning, error, saveError }) {
  return (
    <>
      {lastResult && (
        <Text size="xs" c="dimmed" mt={10}>
          1st Pass Today: {lastResult.stats.todaySqFt.toLocaleString()} sq ft · 2nd Pass: {lastResult.stats.secondPassSqFt.toLocaleString()} sq ft ·
          {lastResult.stats.residualSqFt > 0 && ` Residual: ${lastResult.stats.residualSqFt.toLocaleString()} sq ft ·`}
          {' '}Progress to Date: {lastResult.stats.cumulativeSqFt.toLocaleString()} sq ft · Advance: {lastResult.stats.advanceFt.toLocaleString()} ft ·
          {' '}Cumulative Advance: {(priorAdvanceFt + lastResult.stats.advanceFt).toLocaleString()} ft ·
          {' '}Track points: {lastResult.trackPoints.toLocaleString()}
        </Text>
      )}
      {lastResult?.stats.adjustedCy != null && (
        <Text size="xs" c="dimmed" mt={4}>
          Volume above design grade: {lastResult.stats.grossCy.toLocaleString()} CY gross → <b>{lastResult.stats.adjustedCy.toLocaleString()} CY reported</b>
          {lastResult.stats.todaySqFt > 0 && ` · Avg thickness: ${impliedThicknessFt(lastResult.stats.adjustedCy, lastResult.stats.todaySqFt).toFixed(2)} ft`}
        </Text>
      )}
      {lastResult?.stats.volumeNoDataSqFt > 0 && (
        <Text size="xs" c="orange" mt={4}>
          ⚠ The reference survey has no data for {lastResult.stats.volumeNoDataSqFt.toLocaleString()} sq ft of today&apos;s coverage — the volume above may be under-reported. Re-upload a survey that covers this area on the Dredge Chart settings tab.
        </Text>
      )}
      {refSurfaceError && (
        <Text size="xs" c="orange" mt={4}>Reference survey unavailable ({refSurfaceError}) — coverage rendered without a volume estimate.</Text>
      )}
      {lastResult?.cellBreakdown?.length > 0 && (
        <Box mt={10} style={{ maxWidth: 520 }}>
          <Text size="xs" fw={600} mb={4}>Per-cell breakdown</Text>
          <Table withTableBorder verticalSpacing={2} fz="10px">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Cell</Table.Th>
                <Table.Th ta="right">Today</Table.Th>
                <Table.Th ta="right">1st</Table.Th>
                <Table.Th ta="right">2nd</Table.Th>
                <Table.Th ta="right">Cumulative</Table.Th>
                <Table.Th ta="right">%</Table.Th>
                {lastResult.cellBreakdown[0].adjustedCy != null && <Table.Th ta="right">CY</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lastResult.cellBreakdown.map((c) => (
                <Table.Tr key={c.label}>
                  <Table.Td>{c.label}</Table.Td>
                  <Table.Td ta="right">{c.todaySqFt.toLocaleString()}</Table.Td>
                  <Table.Td ta="right">{c.firstSqFt.toLocaleString()}</Table.Td>
                  <Table.Td ta="right">{c.secondSqFt.toLocaleString()}</Table.Td>
                  <Table.Td ta="right">{c.cumulativeSqFt.toLocaleString()}</Table.Td>
                  <Table.Td ta="right">{c.pct}%</Table.Td>
                  {c.adjustedCy != null && <Table.Td ta="right">{c.adjustedCy.toLocaleString()}</Table.Td>}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}
      {saved && (
        <Text size="xs" c="teal" mt={4}>Saved to this report.</Text>
      )}
      {notice && (
        <Text size="xs" c="dimmed" mt={4}>{notice}</Text>
      )}
      {dateWarning && (
        <Text size="xs" c="orange" mt={4}>{dateWarning}</Text>
      )}
      {error && (
        <Text size="xs" c="red" mt={10}>{error}</Text>
      )}
      {saveError && (
        <Text size="xs" c="red" mt={4}>{saveError}</Text>
      )}
    </>
  )
}
