import { fetchExternalJson, fetchPublicAsset } from '../../data'

const BASEMAPS = {
  topo: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/export',
  imagery: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export',
}

function srParam(crs) {
  const t = crs.trim()
  if (/^\d+$/.test(t)) return t
  return encodeURIComponent(JSON.stringify({ wkt: t }))
}

export async function fetchAerial(bbox, crs, opts = {}) {
  const { source = 'topo', maxPx = 2048, pad = 0.2 } = opts
  if (!crs.trim()) throw new Error('No coordinate system set for this project.')
  if ([bbox.wL, bbox.wR, bbox.wT, bbox.wB].some((n) => !Number.isFinite(n))) {
    throw new Error('Work-area corners must all be numbers.')
  }

  const padX = Math.abs(bbox.wR - bbox.wL) * pad, padY = Math.abs(bbox.wT - bbox.wB) * pad
  const b = { wL: bbox.wL - padX, wR: bbox.wR + padX, wT: bbox.wT + padY, wB: bbox.wB - padY }

  const aspect = Math.abs(b.wR - b.wL) / Math.abs(b.wT - b.wB) || 1
  let outW = maxPx, outH = Math.round(maxPx / aspect)
  if (outH > maxPx) { outH = maxPx; outW = Math.round(maxPx * aspect) }

  const sr = srParam(crs)
  const base = `${BASEMAPS[source]}?bbox=${b.wL},${b.wB},${b.wR},${b.wT}`
    + `&bboxSR=${sr}&imageSR=${sr}&size=${outW},${outH}&format=png24&transparent=false`

  const info = await fetchExternalJson(`${base}&f=json`)
  if (info.error) throw new Error(`USGS basemap service: ${info.error.message ?? 'request rejected (check the coordinate system).'}`)
  const e = info.extent
  if (!e || [e.xmin, e.ymin, e.xmax, e.ymax].some((n) => !Number.isFinite(n))) {
    throw new Error('USGS basemap service did not return a valid extent (check the coordinate system / WKID).')
  }

  const blob = await fetchPublicAsset(`${base}&f=image`)
  if (!blob.type.startsWith('image/')) throw new Error('USGS basemap service did not return an image.')

  return { blob, georef: { wL: e.xmin, wR: e.xmax, wT: e.ymax, wB: e.ymin } }
}
