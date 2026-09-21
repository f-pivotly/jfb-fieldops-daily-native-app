import { useState } from 'react'
import { Button, Group, Text } from '@mantine/core'
import WarningBanner from '../components/WarningBanner'
import { isUnassigned } from '../../../../lib/productionCombos'
import { chartSfForCombo, chartCyForCombo, uncoveredCoverage } from '../../../../lib/dredge/productionLink'

export default function ChartSfControls({
  combos,
  persistedByKey,
  persistCombo,
  chartBreakdown,
  chartTodaySf,
  chartTodayCy,
  volumeOn,
  confirm,
}) {
  const [fillBusy, setFillBusy] = useState(false)
  const [fillStatus, setFillStatus] = useState(null)

  const chartSaved = chartBreakdown.length > 0 || (chartTodaySf != null && chartTodaySf > 0)
  const worked = combos.filter((c) => !isUnassigned(c))
  const targets = chartBreakdown.length > 0
    ? worked
        .map((c) => ({ combo: c, sf: chartSfForCombo(chartBreakdown, c.areaLabel, c.passKey), cy: chartCyForCombo(chartBreakdown, c.areaLabel, c.passKey) }))
        .filter((t) => t.sf != null)
    : (chartTodaySf != null && chartTodaySf > 0 && worked.length === 1
        ? [{ combo: worked[0], sf: Math.round(chartTodaySf), cy: chartTodayCy != null ? Math.round(chartTodayCy) : null }]
        : [])
  const flatMulti = chartBreakdown.length === 0 && chartTodaySf != null && chartTodaySf > 0 && worked.length > 1
  const hasChartCy = targets.some((t) => t.cy != null)
  const flags = chartBreakdown.length > 0 ? uncoveredCoverage(chartBreakdown, worked) : []

  async function fillFromChart(rowsToFill) {
    setFillBusy(true); setFillStatus(null)
    let n = 0, nCy = 0
    try {
      for (const { combo, sf, cy: chartCy } of rowsToFill) {
        const existing = persistedByKey.get(combo.key)
        const sfMatches = existing?.area != null && Math.round(existing.area) === sf
        const cy = chartCy ?? existing?.volume ?? null
        const cyMatches = chartCy == null || (existing?.volume != null && Math.round(existing.volume) === chartCy)
        if (sfMatches && cyMatches) continue
        await persistCombo(combo, {
          volume: cy,
          area: sf,
          notes: existing?.notes ?? null,
        })
        n++
        if (chartCy != null && !cyMatches) nCy++
      }
      setFillStatus(`Filled ${n} row${n === 1 ? '' : 's'} from the chart${nCy ? ` (CY on ${nCy})` : ''}.`)
    } catch (e) {
      setFillStatus(e.message || 'Could not fill SF from the chart.')
    } finally {
      setFillBusy(false)
    }
  }

  async function onPullFromChart() {
    const conflicts = targets.filter((t) => {
      const existing = persistedByKey.get(t.combo.key)
      const sfClash = existing?.area != null && Math.round(existing.area) !== t.sf
      const cyClash = t.cy != null && existing?.volume != null && Math.round(existing.volume) !== t.cy
      return sfClash || cyClash
    })
    if (conflicts.length) {
      const list = conflicts
        .map((t) => {
          const existing = persistedByKey.get(t.combo.key)
          const parts = [`${existing?.area?.toLocaleString() ?? '—'} → ${t.sf.toLocaleString()} sq ft`]
          if (t.cy != null) parts.push(`${existing?.volume?.toLocaleString() ?? '—'} → ${t.cy.toLocaleString()} CY`)
          return `• ${t.combo.areaLabel ?? ''} ${t.combo.passLabel ?? ''}: ${parts.join(', ')}`
        })
        .join('\n')
      if (!(await confirm(
        `${conflicts.length} row(s) already have different values you entered. Overwrite them with the chart values?\n\n${list}\n\n(Rows you haven't filled will be set either way.)`,
      ))) {
        await fillFromChart(targets.filter((t) => !conflicts.includes(t)))
        return
      }
    }
    await fillFromChart(targets)
  }

  return (
    <>
      <Group mb={10} gap={10} align="center" wrap="wrap">
        <Button size="xs" disabled={fillBusy || targets.length === 0} loading={fillBusy} onClick={onPullFromChart}>
          {hasChartCy ? 'Pull SF + CY from chart' : 'Pull SF from chart'}
        </Button>
        <Text size="xs" c="dimmed">
          {!chartSaved
            ? 'Generate and save the daily chart on the Dredge Progress tab, then come back here to pull its Area SF (and estimated CY, if this project has volume turned on) into the rows below.'
            : chartBreakdown.length
              ? `Fills Area SF${hasChartCy ? ' and estimated CY' : ''} on matching DMU + pass rows from the saved dredge chart.`
              : `Fills the day's Area SF${hasChartCy ? ' and estimated CY' : ''} from the saved dredge chart${chartTodaySf ? ` (${Math.round(chartTodaySf).toLocaleString()} sq ft${chartTodayCy != null ? `, ${Math.round(chartTodayCy).toLocaleString()} CY` : ''})` : ''}.`}
          {chartSaved && targets.length === 0 && !flatMulti &&
            (chartBreakdown.length ? ' No matching rows yet — log the DMU/pass in the Event Log first.' : ' No production row yet — log the Area/Pass in the Event Log first.')}
        </Text>
        {fillStatus && <Text size="xs" c="teal">{fillStatus}</Text>}
      </Group>

      {chartSaved && volumeOn && !hasChartCy && (
        <WarningBanner p={10} mb={10}>
          <Text size="xs">
            This day's saved chart has no estimated CY, so only Area SF can be pulled. It was likely saved before this
            project's volume setup was finished — the Dredge Progress tab recalculates every time it opens, so
            re-generate and Save the chart there, then return here.
          </Text>
        </WarningBanner>
      )}

      {flatMulti && (
        <WarningBanner p={10} mb={10}>
          <Text size="xs">
            The chart's coverage ({Math.round(chartTodaySf).toLocaleString()} sq ft) spans more than one area today, so
            it can't be auto-assigned — enter Area SF per row below.
          </Text>
        </WarningBanner>
      )}

      {flags.length > 0 && (
        <WarningBanner p={10} mb={10}>
          <Text size="xs" fw={600}>The chart shows coverage in {flags.length} area(s) with no reported time:</Text>
          {flags.map((f) => (
            <Text key={`${f.label}-${f.pass}`} size="xs">
              {f.label} {f.pass === 1 ? '1st' : '2nd'} pass — {f.sf.toLocaleString()} sq ft dredged, but no event covers
              it. Add the time in the Event Log so production reports accurately.
            </Text>
          ))}
        </WarningBanner>
      )}
    </>
  )
}
