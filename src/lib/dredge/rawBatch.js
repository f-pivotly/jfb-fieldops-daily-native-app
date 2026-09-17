import { crc32, makeZipFromBlobs, readZip } from '../zip'
import { downloadAttachment } from '../../data'

const LOG_DATE = /^RAW(\d{2})(\d{2})(\d{4})\.log$/i
const FOLDER_DATE = /^(\d{2})(\d{2})(\d{2})$/

function sortByName(files) {
  return [...files].sort((a, b) => a.name.localeCompare(b.name))
}

function validDate(yyyy, mm, dd) {
  const mo = +mm
  const da = +dd
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null
  return `${yyyy}-${mm}-${dd}`
}

export function batchFingerprint(files) {
  const sorted = sortByName(files)
  const manifest = sorted.map((f) => `${f.name}:${f.size}`).join('\n')
  const totalBytes = sorted.reduce((sum, f) => sum + f.size, 0)
  const digest = crc32(new TextEncoder().encode(manifest)).toString(16)
  return `${digest}-${sorted.length}-${totalBytes.toString(16)}`
}

export function batchSourceDateISO(files) {
  for (const f of files) {
    const m = f.name.match(LOG_DATE)
    if (m) {
      const iso = validDate(m[3], m[1], m[2])
      if (iso) return iso
    }
  }
  for (const f of files) {
    const m = (f.webkitRelativePath || '').split('/')[0].match(FOLDER_DATE)
    if (m) {
      const iso = validDate(`20${m[1]}`, m[2], m[3])
      if (iso) return iso
    }
  }
  return null
}

export function batchDateWarning(files, reportDateISO) {
  const sourceDate = batchSourceDateISO(files)
  if (!sourceDate || !reportDateISO || sourceDate === reportDateISO) return ''
  return `Heads up: these RAW files look dated ${sourceDate} but this report is ${reportDateISO}. Double-check you picked the right day's folder.`
}

export async function readStoredBatch(fileId, onProgress) {
  const blob = await downloadAttachment(fileId)
  onProgress?.('Unpacking…')
  const entries = await readZip(blob)
  if (!entries.length) throw new Error('The stored archive is empty.')
  return entries.map((entry) => new File([entry.blob], entry.name))
}

export async function buildRawBatchArchive(files, onProgress) {
  const sorted = sortByName(files)
  const blob = await makeZipFromBlobs(
    sorted.map((f) => ({ name: f.name, blob: f })),
    onProgress,
  )
  return {
    blob,
    checksum: batchFingerprint(sorted),
    file_count: sorted.length,
    file_names: sorted.map((f) => f.name),
    total_bytes: sorted.reduce((sum, f) => sum + f.size, 0),
    compressed_bytes: blob.size,
    source_date: batchSourceDateISO(sorted),
  }
}
