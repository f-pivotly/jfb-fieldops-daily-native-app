import { useMemo, useState } from 'react'
import { Box, Button, Group, List, Stack, Text } from '@mantine/core'
import { bucketSqFtForLayer, layersMissingProductionRows } from '../../../../lib/placement/attribution'
import { fmtNum } from '../../lib/realizedToDate'
import WarningBanner, { WARNING_TEXT } from '../components/WarningBanner'

const num = (n) => fmtNum(Number(n) || 0)

export default function BucketSfControls({ coverage, rows, layerNameById, onFillSf, confirm }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  const targets = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => !!r.layer_id)
        .map((r) => ({ row: r, sf: bucketSqFtForLayer(coverage, r.layer_id) }))
        .filter((t) => t.sf != null),
    [rows, coverage],
  )

  const missing = useMemo(
    () => layersMissingProductionRows(coverage, (rows ?? []).map((r) => r.layer_id)),
    [coverage, rows],
  )

  const differing = useMemo(
    () => targets.filter((t) => t.row.area != null && Math.round(t.row.area) !== t.sf),
    [targets],
  )

  const fill = async (list) => {
    setBusy(true)
    setStatus(null)
    let n = 0
    try {
      for (const { row, sf } of list) {
        if (row.area != null && Math.round(row.area) === sf) continue
        await onFillSf(row, sf)
        n++
      }
      setStatus(
        n === 0
          ? 'Every row already matches the bucket coverage.'
          : `Filled SF on ${n} row${n === 1 ? '' : 's'} from the bucket file.`,
      )
    } catch (e) {
      setStatus(e.message || 'Could not fill SF from the bucket file.')
    } finally {
      setBusy(false)
    }
  }

  const onPull = async () => {
    if (differing.length > 0) {
      const list = differing
        .map((t) => `• ${layerNameById.get(t.row.layer_id) ?? 'layer'}: ${num(t.row.area)} → ${num(t.sf)}`)
        .join('\n')
      const ok = await confirm(
        `${differing.length} row(s) already have a different SF you entered. Overwrite them with the bucket values?\n\n${list}\n\n(Rows you haven't filled will be set either way.)`,
      )
      if (!ok) {
        await fill(targets.filter((t) => !differing.includes(t)))
        return
      }
    }
    await fill(targets)
  }

  const totalSf = targets.reduce((a, t) => a + t.sf, 0)

  let hint
  if (targets.length > 0) {
    hint = `${targets.length} row${targets.length === 1 ? '' : 's'} matched · ${num(totalSf)} SF from ${coverage.buckets.length} bucket placements`
  } else if (coverage.layers.length === 0) {
    hint = 'No bucket coverage for this day yet.'
  } else {
    hint = 'Bucket coverage is loaded, but no production row has a layer yet — choose a layer on a row below and it becomes fillable.'
  }

  return (
    <Box p={12} mb={10} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6, background: 'var(--mantine-color-gray-0)' }}>
      <Stack gap={8}>
        <Group gap={12} wrap="wrap" align="center">
          <Button
            size="xs"
            disabled={busy || targets.length === 0}
            loading={busy}
            onClick={onPull}
            style={{ background: '#0F2744', border: 'none' }}
          >
            Pull SF from buckets
          </Button>
          <Text size="xs" c="dimmed">{hint}</Text>
        </Group>

        {targets.length > 0 && (
          <Stack gap={2}>
            {targets.map((t) => {
              const same = t.row.area != null && Math.round(t.row.area) === t.sf
              const diff = t.row.area != null && !same
              return (
                <Text key={t.row.id} size="xs" c="dimmed">
                  {layerNameById.get(t.row.layer_id) ?? 'layer'} <strong>{num(t.sf)} SF</strong>
                  {same && <Text span c="teal"> · already set</Text>}
                  {diff && <Text span c="orange.8"> · you entered {num(t.row.area)}</Text>}
                </Text>
              )
            })}
          </Stack>
        )}

        {missing.length > 0 && (
          <WarningBanner p={8}>
            <Text size="xs" fw={600} c={WARNING_TEXT}>
              {missing.length} layer{missing.length === 1 ? '' : 's'} placed with no production row
            </Text>
            <Text size="xs" c={WARNING_TEXT}>
              Add a row for {missing.map((l) => l.layerName).join(', ')} to record the tons:
            </Text>
            <List size="xs" c={WARNING_TEXT} withPadding>
              {missing.map((l) => (
                <List.Item key={l.layerId}>
                  {l.layerName} · {l.bucketCount} buckets · {num(l.sqFt)} SF
                </List.Item>
              ))}
            </List>
          </WarningBanner>
        )}

        {coverage.snapped > 0 && (
          <Text size="xs" c="orange.8">
            {coverage.snapped} bucket{coverage.snapped === 1 ? '' : 's'} fell outside every event window
            and were matched to the nearest — the SF split may shift once the event times are tightened.
          </Text>
        )}

        {status && <Text size="xs" c="dimmed">{status}</Text>}
      </Stack>
    </Box>
  )
}
