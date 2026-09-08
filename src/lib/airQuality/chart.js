// Canvas renderer for the Daily Air Monitoring charts (PM10 mg/m3). Ported
// from the non-native app's src/lib/airQuality/chart.ts -- same two-chart
// split (LLRA / Mineral Building Property), Alert/Action dotted lines, and
// gap-bridging series (a briefly-offline sensor bends the line instead of
// breaking it).

export const AIR_COLORS = {
  background: '#f28c1e',
  downwind: '#c00000',
  southBeach: '#f4a7c3',
  entrance: '#843c0c',
  spaFence: '#7030a0',
  alert: '#e6c300',
  action: '#ff0000',
  earlyWarning: '#ff0000',
}

export function renderAirChart(day, spec, opts = {}) {
  const width = opts.width ?? 620
  const height = opts.height ?? 640
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  ctx.font = '12px Arial'
  const legendRows = []
  {
    let row = []
    let rowW = 0
    const maxW = width - 60
    for (const s of spec.series) {
      const w = 24 + ctx.measureText(s.label).width + 20
      if (rowW + w > maxW && row.length) { legendRows.push(row); row = []; rowW = 0 }
      row.push(s)
      rowW += w
    }
    if (row.length) legendRows.push(row)
  }
  const legendH = legendRows.length * 22 + 6

  const margin = { left: 62, right: 18, top: 36, bottom: 90 + legendH }
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom
  const n = day.slots.length

  let maxVal = 0
  for (const s of spec.series) {
    for (const v of s.values) if (v !== null && v > maxVal) maxVal = v
  }
  const yMax = spec.yMax ?? Math.max(0.02, Math.ceil((maxVal * 1.08) / 0.02) * 0.02)

  const x = (i) => margin.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW)
  const y = (v) => margin.top + plotH - (Math.min(Math.max(v, 0), yMax) / yMax) * plotH

  ctx.fillStyle = '#404040'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(spec.title, margin.left + plotW / 2, 10)

  ctx.font = '11px Arial'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const ySteps = spec.yMax ? 5 : Math.max(1, Math.round(yMax / 0.02))
  for (let i = 0; i <= ySteps; i++) {
    const v = (yMax / ySteps) * i
    const yy = y(v)
    ctx.strokeStyle = '#e6e6e6'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(margin.left, yy)
    ctx.lineTo(margin.left + plotW, yy)
    ctx.stroke()
    ctx.fillStyle = '#404040'
    ctx.fillText(v.toFixed(3), margin.left - 8, yy)
  }

  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < n; i++) {
    if (i % 2 !== 0) continue
    const xx = x(i)
    ctx.save()
    ctx.translate(xx, margin.top + plotH + 8)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'right'
    ctx.fillText(day.slots[i].timeLabel, 0, 0)
    ctx.restore()
    ctx.strokeStyle = '#cccccc'
    ctx.beginPath()
    ctx.moveTo(xx, margin.top + plotH)
    ctx.lineTo(xx, margin.top + plotH + 4)
    ctx.stroke()
  }

  ctx.font = 'bold 12px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('Time', margin.left + plotW / 2, margin.top + plotH + 76)

  ctx.strokeStyle = '#808080'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(margin.left, margin.top)
  ctx.lineTo(margin.left, margin.top + plotH)
  ctx.lineTo(margin.left + plotW, margin.top + plotH)
  ctx.stroke()
  ctx.save()
  ctx.translate(16, margin.top + plotH / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '11px Arial'
  ctx.fillText('milligrams per cubic meter (mg/m3)', 0, 0)
  ctx.restore()

  // Series -- bridge nulls (a briefly-offline sensor bends the line, doesn't break it).
  for (const s of spec.series) {
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.lineWidth ?? 2.5
    ctx.setLineDash(s.dash ?? [])
    ctx.beginPath()
    let started = false
    for (let i = 0; i < n; i++) {
      const v = s.values[i]
      if (v === null) continue
      if (!started) { ctx.moveTo(x(i), y(v)); started = true }
      else ctx.lineTo(x(i), y(v))
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  ctx.font = '12px Arial'
  ctx.textBaseline = 'middle'
  let ly = margin.top + plotH + 100
  for (const row of legendRows) {
    const rowW = row.reduce((acc, s) => acc + 24 + ctx.measureText(s.label).width + 20, -20)
    let lx = margin.left + (plotW - rowW) / 2
    for (const s of row) {
      ctx.strokeStyle = s.color
      ctx.lineWidth = 3
      ctx.setLineDash(s.dash ?? [])
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(lx + 18, ly)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#404040'
      ctx.textAlign = 'left'
      ctx.fillText(s.label, lx + 24, ly)
      lx += 24 + ctx.measureText(s.label).width + 20
    }
    ly += 22
  }

  return { dataUrl: canvas.toDataURL('image/png'), width, height }
}

/** Build the two standard chart specs (LLRA / MBP) from an AirDay + config. */
export function buildAirChartSpecs(day, stations, thresholds) {
  const colorFor = (key, i) => {
    const named = {
      nw_beach: AIR_COLORS.background,
      ne_beach: AIR_COLORS.downwind,
      south_beach: AIR_COLORS.southBeach,
      mbp_entrance: AIR_COLORS.entrance,
      spa_south_fence: AIR_COLORS.spaFence,
    }
    return named[key] ?? ['#f28c1e', '#c00000', '#f4a7c3', '#843c0c', '#7030a0'][i % 5]
  }

  const seriesFor = (chart) =>
    stations
      .filter((s) => s.chart === chart)
      .map((s, i) => ({
        label: s.label,
        color: colorFor(s.key, i),
        values: day.slots.map((slot) => slot.values[s.key] ?? null),
      }))

  const llra = {
    title: 'Air Monitoring Data - LLRA',
    series: [
      { label: 'Alert Level', color: AIR_COLORS.alert, dash: [3, 5], lineWidth: 3, values: day.slots.map((s) => s.alertLevel) },
      { label: 'Action Level', color: AIR_COLORS.action, dash: [3, 5], lineWidth: 3, values: day.slots.map((s) => s.actionLevel) },
      ...seriesFor('llra'),
    ],
  }

  const ew = thresholds?.early_warning_mgm3
  const mbp = {
    title: 'Air Monitoring Data - Mineral Building Property',
    yMax: ew != null ? Math.max(1.0, ew) : undefined,
    series: [
      ...(ew != null
        ? [{ label: 'Early Warning', color: AIR_COLORS.earlyWarning, dash: [10, 7], lineWidth: 3, values: day.slots.map(() => ew) }]
        : []),
      ...seriesFor('mbp'),
    ],
  }

  return { llra, mbp }
}
