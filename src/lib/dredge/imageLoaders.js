// Small shared helpers for resolving stored images to ImageBitmaps before a
// (synchronous) renderChart() call. Used by both DredgeProgressTab.jsx (the
// daily chart) and DredgeChartTab.jsx (the settings "Preview chart" dry-run) --
// extracted here instead of duplicated in both.
import { downloadAttachment, fetchPublicAsset } from '../../data'

export async function loadAttachmentImage(fileId) {
  if (!fileId) return null
  try {
    const blob = await downloadAttachment(fileId)
    return await createImageBitmap(blob)
  } catch {
    return null
  }
}

export async function loadPublicImage(url) {
  try {
    return await createImageBitmap(await fetchPublicAsset(url))
  } catch {
    return null
  }
}

// Resolves an isopach_tiles/aerial_tiles array ({file_id, georef}[]) into
// {image, georef}[] chart.js can draw directly. A tile whose image fails to
// load is just dropped, same silent-degrade behavior as a single image.
export async function loadTiles(tiles) {
  if (!tiles?.length) return []
  const resolved = await Promise.all(tiles.map(async (t) => ({ image: await loadAttachmentImage(t.file_id), georef: t.georef })))
  return resolved.filter((t) => !!t.image)
}
