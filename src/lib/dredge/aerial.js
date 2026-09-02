import { fetchExternalJson, fetchPublicAsset } from '../../data'

// Auto-fetch a georeferenced basemap for a project's work area, so PMs don't
// have to export and align imagery by hand. Ported from
// jfb-fieldops-daily/src/lib/dredge/aerial.ts (types dropped to JSDoc,
// matching designVolume.js's convention). Asks the public USGS imagery
// service (public domain, no API key, CORS-open) to render the work-area
// bbox directly IN THE PROJECT'S COORDINATE SYSTEM -- Esri's projection
// engine does the reprojection server-side, so the returned image lines up
// by construction and we just store the extent the server reports. No
// client-side projection needed.

/** @typedef {{wL: number, wR: number, wT: number, wB: number}} Georef */

/** Public USGS basemaps (no key, CORS-open). "topo" reads best for shallow /
 *  vegetated water bodies (lake shown as blue with shoreline, roads, labels);
 *  "imagery" is true-color satellite, better for open water / land sites. */
const BASEMAPS = {
  topo: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/export',
  imagery: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export',
}

/** Turn a CRS string into an ArcGIS spatialReference param: a bare number is a
 *  WKID; anything else is treated as WKT (.prj) and passed as a JSON SR. */
function srParam(crs) {
  const t = crs.trim()
  if (/^\d+$/.test(t)) return t
  return encodeURIComponent(JSON.stringify({ wkt: t }))
}

/** Fetch a USGS basemap PNG covering `bbox` (already in the project CRS, given
 *  by `crs` as a WKID or .prj WKT). The server reprojects into that CRS, so
 *  the returned image aligns with the chart's coverage exactly; we store the
 *  extent the server reports as the georef. Throws on a bad CRS or fetch
 *  error.
 * @param {Georef} bbox @param {string} crs
 * @param {{source?: 'topo' | 'imagery', maxPx?: number, pad?: number}} [opts]
 * @returns {Promise<{blob: Blob, georef: Georef}>} */
export async function fetchAerial(bbox, crs, opts = {}) {
  const { source = 'topo', maxPx = 2048, pad = 0.2 } = opts
  if (!crs.trim()) throw new Error('No coordinate system set for this project.')
  if ([bbox.wL, bbox.wR, bbox.wT, bbox.wB].some((n) => !Number.isFinite(n))) {
    throw new Error('Work-area corners must all be numbers.')
  }

  // Pad the work-area box so the basemap extends AROUND the isopach for context.
  const padX = Math.abs(bbox.wR - bbox.wL) * pad, padY = Math.abs(bbox.wT - bbox.wB) * pad
  const b = { wL: bbox.wL - padX, wR: bbox.wR + padX, wT: bbox.wT + padY, wB: bbox.wB - padY }

  // Image size matches the bbox aspect IN PROJECT UNITS (feet), so the server
  // returns the requested extent without distortion.
  const aspect = Math.abs(b.wR - b.wL) / Math.abs(b.wT - b.wB) || 1
  let outW = maxPx, outH = Math.round(maxPx / aspect)
  if (outH > maxPx) { outH = maxPx; outW = Math.round(maxPx * aspect) }

  const sr = srParam(crs)
  const base = `${BASEMAPS[source]}?bbox=${b.wL},${b.wB},${b.wR},${b.wT}`
    + `&bboxSR=${sr}&imageSR=${sr}&size=${outW},${outH}&format=png24&transparent=false`

  // Ask for the metadata first to learn the EXACT extent the server rendered
  // (it can nudge the box to fit the image), then fetch the matching image.
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
