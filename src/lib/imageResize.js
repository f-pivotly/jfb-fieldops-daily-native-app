export const IMAGE_PRESETS = {
  pdfPhoto: { maxEdge: 1600, type: 'image/jpeg', quality: 0.82 },
  pdfAerial: { maxEdge: 1800, type: 'image/jpeg', quality: 0.85 },
  pdfChart: { maxEdge: 2200, type: 'image/png' },
  uploadPhoto: { maxEdge: 2400, type: 'image/jpeg', quality: 0.85 },
}

const RESIZABLE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp'])

function canResize(blob) {
  return !!blob && RESIZABLE_TYPES.has(String(blob.type || '').toLowerCase())
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' })
    } catch {
      return null
    }
  }
  return null
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function resizeImageBlob(blob, { maxEdge, type, quality } = IMAGE_PRESETS.pdfPhoto) {
  if (!canResize(blob)) return blob
  const bitmap = await decodeImage(blob)
  if (!bitmap) return blob
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    const out = await canvasToBlob(canvas, type, quality)
    return out && out.size < blob.size ? out : blob
  } finally {
    bitmap.close?.()
  }
}

export function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function imageBlobToDataUri(blob, preset) {
  return blobToDataUri(await resizeImageBlob(blob, preset))
}

export async function shrinkPhotoFile(file, preset = IMAGE_PRESETS.uploadPhoto) {
  const out = await resizeImageBlob(file, preset)
  if (out === file) return file
  const dot = file.name.lastIndexOf('.')
  const base = dot > 0 ? file.name.slice(0, dot) : file.name
  const ext = out.type === 'image/png' ? '.png' : '.jpg'
  return new File([out], `${base}${ext}`, { type: out.type, lastModified: file.lastModified })
}
