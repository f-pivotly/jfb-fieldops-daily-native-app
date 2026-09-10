const PAGE_HEIGHT_PT = 792
const MARGIN_PT = 36
const PAGE_WIDTH_PT = 612
const CONTENT_WIDTH_PT = PAGE_WIDTH_PT - MARGIN_PT * 2

const CONTENT_BUDGET_PT = PAGE_HEIGHT_PT - MARGIN_PT * 2

const DENSITY_TIERS = ['normal', 'compact', 'dense', 'ultra']

const DENSITY_SCALES = {
  normal: 1.0,
  compact: 0.88,
  dense: 0.78,
  ultra: 0.68,
}

const PHOTO_HEIGHT_FRACTION = 0.78

function constantsFor(density) {
  const s = DENSITY_SCALES[density]
  const ps = Math.max(0.86, s)
  return {
    metadata: 80 * ps,
    title: 22 * s,
    sectionBand: 18 * s,
    narrativeLineHeight: 12 * s,
    narrativeBodyPad: 5 * s,
    photoFrameHeight: ((CONTENT_WIDTH_PT - 10) / 2) * (3 / 4) * ps * PHOTO_HEIGHT_FRACTION,
    photoLabel: 12 * s,
    metricsHeaderRow: 18 * s,
    metricsRow: 18 * s,
    metricsFooter: 14 * s,
    interBlockGap: 6,
    charsPerLine: Math.floor((CONTENT_WIDTH_PT - 24) / (4.5 * s)),
  }
}

const stripRichMarkers = (content) => String(content ?? '').replace(/\*+/g, '')

function countWrappedLines(text, charsPerLine) {
  if (!text) return 1
  return text
    .split(/\r?\n/)
    .reduce((sum, segment) => sum + Math.max(1, Math.ceil((segment.length || 1) / charsPerLine)), 0)
}

function estimateNarrative(n, c) {
  const stripped = n?.content ? stripRichMarkers(n.content) : ''
  const lines = stripped ? countWrappedLines(stripped, c.charsPerLine) : 1
  const bodyHeight = lines * c.narrativeLineHeight + c.narrativeBodyPad
  return c.sectionBand + bodyHeight + c.interBlockGap
}

function estimateCoverPageHeight(data, density = 'normal') {
  const c = constantsFor(density)
  const narratives = (data.narratives ?? []).reduce((a, n) => a + estimateNarrative(n, c), 0)
  const photos = c.sectionBand + c.photoFrameHeight + c.photoLabel + c.interBlockGap
  const metrics =
    c.sectionBand +
    c.metricsHeaderRow +
    (data.metricsCount ?? 0) * c.metricsRow +
    c.metricsFooter +
    c.interBlockGap

  const totalPt = c.metadata + c.title + narratives + photos + metrics
  return {
    totalPt,
    budgetPt: CONTENT_BUDGET_PT,
    willOverflow: totalPt > CONTENT_BUDGET_PT,
    estimatedPages: Math.max(1, Math.ceil(totalPt / CONTENT_BUDGET_PT)),
    density,
    breakdown: { metadata: c.metadata, title: c.title, narratives, photos, metrics },
  }
}

export function pickDensity(data) {
  for (const d of DENSITY_TIERS) {
    const e = estimateCoverPageHeight(data, d)
    if (!e.willOverflow) return { density: d, estimate: e, forcedOverflow: false }
  }
  const dense = estimateCoverPageHeight(data, 'dense')
  return { density: 'dense', estimate: dense, forcedOverflow: true }
}
