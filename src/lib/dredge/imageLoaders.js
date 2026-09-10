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

export async function loadTiles(tiles) {
  if (!tiles?.length) return []
  const resolved = await Promise.all(tiles.map(async (t) => ({ image: await loadAttachmentImage(t.file_id), georef: t.georef })))
  return resolved.filter((t) => !!t.image)
}
