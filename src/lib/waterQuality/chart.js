const COLORS = {
  background: '#1f4e9c',
  earlyWarning: '#7a8c2e',
  compliance: '#6b6b6b',
  complianceLevel: '#e8a33d',
  earlyWarningLevel: '#c9772e',
  backgroundX15: '#74a9d8',
  axis: '#444444',
  grid: '#e0e0e0',
  text: '#333333',
}

export function renderTurbidityChart(day, thresholds, opts = {}) {
  const width = opts.width ?? 1000
  const height = opts.height ?? 420
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const margin = { left: 54, right: 20, top: 16, bottom: 80 }
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom

  const slots = day.slots
  const n = slots.length

  const ewDelta = thresholds.early_warning_delta_ntu
  const compDelta = thresholds.compliance_delta_ntu
  const deltaMode = ewDelta != null || compDelta != null
  const complianceLevel = thresholds.compliance_1hr_ntu ?? 50
  const bgMult = thresholds.background_multiplier ?? 1.5
  const hasEwMonitor = slots.some((s) => s.earlyWarning !== null)

  let maxVal = 10
  for (const s of slots) {
    for (const v of [s.background, s.earlyWarning, s.compliance]) {
      if (v !== null && v > maxVal) maxVal = v
    }
    if (deltaMode && s.background !== null) {
      if (compDelta != null && s.background + compDelta > maxVal) maxVal = s.background + compDelta
      if (ewDelta != null && s.background + ewDelta > maxVal) maxVal = s.background + ewDelta
    }
  }
  maxVal = Math.ceil((maxVal * 1.05) / 10) * 10

  const x = (i) => margin.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW)
  const y = (v) => margin.top + plotH - (Math.max(v, 0) / maxVal) * plotH

  ctx.strokeStyle = COLORS.grid
  ctx.fillStyle = COLORS.text
  ctx.lineWidth = 1
  ctx.font = '11px Arial'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const yStep = maxVal > 100 ? 25 : 10
  for (let v = 0; v <= maxVal; v += yStep) {
    const yy = y(v)
    ctx.strokeStyle = v === complianceLevel ? '#c9c9c9' : COLORS.grid
    ctx.beginPath()
    ctx.moveTo(margin.left, yy)
    ctx.lineTo(margin.left + plotW, yy)
    ctx.stroke()
    ctx.fillText(v.toFixed(0), margin.left - 6, yy)
  }

  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < n; i++) {
    if (i % 4 !== 0 && i !== n - 1) continue
    const xx = x(i)
    ctx.save()
    ctx.translate(xx, margin.top + plotH + 8)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'right'
    ctx.fillText(slots[i].timeLabel, 0, 0)
    ctx.restore()
    ctx.strokeStyle = COLORS.grid
    ctx.beginPath()
    ctx.moveTo(xx, margin.top + plotH)
    ctx.lineTo(xx, margin.top + plotH + 4)
    ctx.stroke()
  }

  ctx.strokeStyle = COLORS.axis
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(margin.left, margin.top)
  ctx.lineTo(margin.left, margin.top + plotH)
  ctx.lineTo(margin.left + plotW, margin.top + plotH)
  ctx.stroke()

  ctx.save()
  ctx.translate(14, margin.top + plotH / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 11px Arial'
  ctx.fillText('Turbidity NTUs', 0, 0)
  ctx.restore()

  const drawSeries = (pick, color, lineWidth = 2, dash = []) => {
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.setLineDash(dash)
    ctx.beginPath()
    let started = false
    for (let i = 0; i < n; i++) {
      const v = pick(slots[i])
      if (v === null) { started = false; continue }
      if (!started) { ctx.moveTo(x(i), y(v)); started = true }
      else ctx.lineTo(x(i), y(v))
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (deltaMode) {
    if (compDelta != null) {
      drawSeries((s) => (s.background !== null ? s.background + compDelta : null), COLORS.complianceLevel, 2, [8, 6])
    }
    if (ewDelta != null) {
      drawSeries((s) => (s.background !== null ? s.background + ewDelta : null), COLORS.earlyWarningLevel, 2, [4, 4])
    }
  } else {
    if (complianceLevel <= maxVal) drawSeries(() => complianceLevel, COLORS.complianceLevel, 2, [8, 6])
    drawSeries((s) => (s.background !== null ? s.background * bgMult : null), COLORS.backgroundX15, 1.5)
  }
  drawSeries((s) => s.background, COLORS.background)
  if (hasEwMonitor) drawSeries((s) => s.earlyWarning, COLORS.earlyWarning)
  drawSeries((s) => s.compliance, COLORS.compliance)

  const legend = [['Background NTUs', COLORS.background]]
  if (hasEwMonitor) legend.push(['Early Warning NTUs', COLORS.earlyWarning])
  legend.push(['Compliance NTUs', COLORS.compliance])
  if (deltaMode) {
    if (compDelta != null) legend.push([`Compliance (BG +${compDelta})`, COLORS.complianceLevel])
    if (ewDelta != null) legend.push([`Early Warning (BG +${ewDelta})`, COLORS.earlyWarningLevel])
  } else {
    legend.push([`${complianceLevel} NTU Compliance Level`, COLORS.complianceLevel])
    legend.push([`${bgMult}x Background NTUs`, COLORS.backgroundX15])
  }

  ctx.font = '11px Arial'
  ctx.textBaseline = 'middle'
  let lx = margin.left
  const ly = height - 14
  for (const [label, color] of legend) {
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(lx, ly)
    ctx.lineTo(lx + 20, ly)
    ctx.stroke()
    ctx.fillStyle = COLORS.text
    ctx.textAlign = 'left'
    ctx.fillText(label, lx + 25, ly)
    lx += 25 + ctx.measureText(label).width + 20
  }

  return { dataUrl: canvas.toDataURL('image/png'), width, height }
}

const TIDAL_COLORS = {
  upstream: '#1f4e9c',
  downstream: '#6b6b6b',
  tide: '#2a9d8f',
  complianceLine: '#e8a33d',
  earlyWarningLine: '#c9772e',
  exceed: '#d62728',
  axis: '#444444',
  grid: '#e0e0e0',
  text: '#333333',
}

export function renderTidalTurbidityChart(day, opts = {}) {
  const compliance = opts.compliance ?? false
  const width = opts.width ?? 1580
  const height = opts.height ?? 640
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const margin = { left: 64, right: 64, top: 20, bottom: 110 }
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom
  const slots = day.slots
  const n = slots.length

  let maxNtu = 10
  for (const s of slots) {
    const vals = compliance ? [s.upstream, s.downstream, s.complianceLine ?? null] : [s.upstream, s.downstream]
    for (const v of vals) if (v !== null && v !== undefined && v > maxNtu) maxNtu = v
  }
  maxNtu = Math.ceil((maxNtu * 1.1) / 5) * 5
  const tideVals = slots.map((s) => s.tideFt).filter((v) => v !== null)
  const hasTide = tideVals.length > 0
  const maxTide = hasTide ? Math.ceil((Math.max(...tideVals) * 1.1) / 2) * 2 : 16

  const x = (i) => margin.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW)
  const yN = (v) => margin.top + plotH - (Math.max(v, 0) / maxNtu) * plotH
  const yT = (v) => margin.top + plotH - (Math.max(v, 0) / maxTide) * plotH

  ctx.lineWidth = 1
  ctx.font = '16px Arial'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const ntuStep = maxNtu > 50 ? 10 : 5
  for (let v = 0; v <= maxNtu; v += ntuStep) {
    const yy = yN(v)
    ctx.strokeStyle = TIDAL_COLORS.grid
    ctx.beginPath()
    ctx.moveTo(margin.left, yy)
    ctx.lineTo(margin.left + plotW, yy)
    ctx.stroke()
    ctx.fillStyle = TIDAL_COLORS.text
    ctx.fillText(v.toFixed(0), margin.left - 8, yy)
  }
  if (hasTide) {
    ctx.textAlign = 'left'
    ctx.fillStyle = TIDAL_COLORS.tide
    const tideStep = maxTide > 12 ? 4 : 2
    for (let v = 0; v <= maxTide; v += tideStep) {
      ctx.fillText(v.toFixed(0), margin.left + plotW + 8, yT(v))
    }
  }

  ctx.fillStyle = TIDAL_COLORS.text
  const xEvery = Math.max(1, Math.round(n / 12))
  for (let i = 0; i < n; i++) {
    if (i % xEvery !== 0 && i !== n - 1) continue
    ctx.save()
    ctx.translate(x(i), margin.top + plotH + 10)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(slots[i].timeLabel, 0, 0)
    ctx.restore()
  }

  ctx.strokeStyle = TIDAL_COLORS.axis
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(margin.left, margin.top)
  ctx.lineTo(margin.left, margin.top + plotH)
  ctx.lineTo(margin.left + plotW, margin.top + plotH)
  ctx.stroke()

  const axisTitle = (text, cx, color) => {
    ctx.save()
    ctx.translate(cx, margin.top + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 16px Arial'
    ctx.fillStyle = color
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }
  axisTitle('Turbidity NTUs', 16, TIDAL_COLORS.text)
  if (hasTide) axisTitle('Tide Height (ft)', width - 16, TIDAL_COLORS.tide)

  const drawSeries = (pick, y, color, lineWidth = 2.5, dash = []) => {
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.setLineDash(dash)
    ctx.beginPath()
    let started = false
    for (let i = 0; i < n; i++) {
      const v = pick(slots[i])
      if (v === null || v === undefined) { started = false; continue }
      if (!started) { ctx.moveTo(x(i), y(v)); started = true }
      else ctx.lineTo(x(i), y(v))
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (hasTide) drawSeries((s) => s.tideFt, yT, TIDAL_COLORS.tide, 2, [8, 6])
  if (compliance) {
    drawSeries((s) => s.complianceLine ?? null, yN, TIDAL_COLORS.complianceLine, 2, [8, 6])
    drawSeries((s) => s.earlyWarningLine ?? null, yN, TIDAL_COLORS.earlyWarningLine, 2, [4, 4])
  }
  drawSeries((s) => s.upstream, yN, TIDAL_COLORS.upstream)
  drawSeries((s) => s.downstream, yN, TIDAL_COLORS.downstream)
  if (compliance) {
    ctx.fillStyle = TIDAL_COLORS.exceed
    for (let i = 0; i < n; i++) {
      const s = slots[i]
      const line = s.complianceLine ?? null
      if (!s.exceedance || line === null) continue
      for (const v of [s.upstream, s.downstream]) {
        if (v !== null && v > line) {
          ctx.beginPath()
          ctx.arc(x(i), yN(v), 5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }

  const legend = [
    ['Upstream NTUs', TIDAL_COLORS.upstream],
    ['Downstream NTUs', TIDAL_COLORS.downstream],
  ]
  if (compliance) {
    legend.push(['Not-to-Exceed', TIDAL_COLORS.complianceLine])
    legend.push(['Response Action', TIDAL_COLORS.earlyWarningLine])
  }
  if (hasTide) legend.push(['Tide Height (ft)', TIDAL_COLORS.tide])
  ctx.font = '15px Arial'
  ctx.textBaseline = 'middle'
  let lx = margin.left
  const ly = height - 18
  for (const [label, color] of legend) {
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(lx, ly)
    ctx.lineTo(lx + 26, ly)
    ctx.stroke()
    ctx.fillStyle = TIDAL_COLORS.text
    ctx.textAlign = 'left'
    ctx.fillText(label, lx + 32, ly)
    lx += 32 + ctx.measureText(label).width + 28
  }

  return { dataUrl: canvas.toDataURL('image/png'), width, height }
}
