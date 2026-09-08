// Canvas renderer for the Daily Turbidity Reporting chart. Draws the
// monitor series, the compliance line, and the 1.5x background series onto
// an offscreen canvas and returns a PNG data URL, exactly like the
// non-native app's src/lib/waterQuality/chart.ts (renderTurbidityChart) --
// absolute-threshold mode only (Torch Lake style); delta mode (Penobscot
// tidal sites) is out of scope for this phase.

const COLORS = {
  background: '#1f4e9c',
  earlyWarning: '#7a8c2e',
  compliance: '#6b6b6b',
  complianceLevel: '#e8a33d',
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
  const complianceLevel = thresholds.compliance_1hr_ntu ?? 50
  const bgMult = thresholds.background_multiplier ?? 1.5
  const hasEwMonitor = slots.some((s) => s.earlyWarning !== null)

  let maxVal = 10
  for (const s of slots) {
    for (const v of [s.background, s.earlyWarning, s.compliance]) {
      if (v !== null && v > maxVal) maxVal = v
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

  if (complianceLevel <= maxVal) drawSeries(() => complianceLevel, COLORS.complianceLevel, 2, [8, 6])
  drawSeries((s) => (s.background !== null ? s.background * bgMult : null), COLORS.backgroundX15, 1.5)
  drawSeries((s) => s.background, COLORS.background)
  if (hasEwMonitor) drawSeries((s) => s.earlyWarning, COLORS.earlyWarning)
  drawSeries((s) => s.compliance, COLORS.compliance)

  const legend = [['Background NTUs', COLORS.background]]
  if (hasEwMonitor) legend.push(['Early Warning NTUs', COLORS.earlyWarning])
  legend.push(['Compliance NTUs', COLORS.compliance])
  legend.push([`${complianceLevel} NTU Compliance Level`, COLORS.complianceLevel])
  legend.push([`${bgMult}x Background NTUs`, COLORS.backgroundX15])

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
