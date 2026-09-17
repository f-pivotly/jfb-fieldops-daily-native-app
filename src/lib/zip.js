const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(bytes) {
  let crc = ~0
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 255]
  return ~crc >>> 0
}

const enc = new TextEncoder()
const u16 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255])
const u32 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255])

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

function localHeader(name, method, crc, compressedSize, size) {
  return concat(
    u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
    u32(crc), u32(compressedSize), u32(size), u16(name.length), u16(0), name,
  )
}

function centralHeader(name, method, crc, compressedSize, size, offset) {
  return concat(
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
    u32(crc), u32(compressedSize), u32(size),
    u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0),
    u32(offset), name,
  )
}

function endOfCentralDirectory(count, cdSize, cdOffset) {
  return concat(
    u32(0x06054b50), u16(0), u16(0), u16(count), u16(count),
    u32(cdSize), u32(cdOffset), u16(0),
  )
}

function seal(parts, central, offset, count) {
  const cd = concat(...central)
  return new Blob(
    [...parts, cd, endOfCentralDirectory(count, cd.length, offset)],
    { type: 'application/zip' },
  )
}

export function makeZip(files) {
  const parts = []
  const central = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = enc.encode(f.text)
    const crc = crc32(data)
    const header = localHeader(name, 0, crc, data.length, data.length)
    parts.push(header, data)
    central.push(centralHeader(name, 0, crc, data.length, data.length, offset))
    offset += header.length + data.length
  }
  return seal(parts, central, offset, files.length)
}

function deflateSupported() {
  try {
    new CompressionStream('deflate-raw')
    return true
  } catch {
    return false
  }
}

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const u16At = (bytes, at) => bytes[at] | (bytes[at + 1] << 8)
const u32At = (bytes, at) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0

function findCentralDirectory(bytes) {
  const floor = Math.max(0, bytes.length - 22 - 0xffff)
  for (let at = bytes.length - 22; at >= floor; at--) {
    if (u32At(bytes, at) === 0x06054b50) return at
  }
  return -1
}

async function inflateRaw(blob) {
  const stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).blob()
}

export async function readZip(zipBlob) {
  const bytes = new Uint8Array(await zipBlob.arrayBuffer())
  const eocd = findCentralDirectory(bytes)
  if (eocd < 0) throw new Error('That file is not a readable zip archive.')

  const count = u16At(bytes, eocd + 10)
  const decoder = new TextDecoder()
  let at = u32At(bytes, eocd + 16)
  const entries = []

  for (let i = 0; i < count; i++) {
    if (u32At(bytes, at) !== 0x02014b50) throw new Error('The zip directory is damaged — the archive cannot be read.')
    const method = u16At(bytes, at + 10)
    const compressedSize = u32At(bytes, at + 20)
    const nameLength = u16At(bytes, at + 28)
    const extraLength = u16At(bytes, at + 30)
    const commentLength = u16At(bytes, at + 32)
    const localOffset = u32At(bytes, at + 42)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extraLength + commentLength

    if (name.endsWith('/')) continue
    if (method !== 0 && method !== 8) throw new Error(`"${name}" uses an unsupported compression method.`)

    const dataAt = localOffset + 30 + u16At(bytes, localOffset + 26) + u16At(bytes, localOffset + 28)
    const data = zipBlob.slice(dataAt, dataAt + compressedSize)
    entries.push({ name, blob: method === 8 ? await inflateRaw(data) : data })
  }

  return entries
}

export async function makeZipFromBlobs(entries, onProgress) {
  const deflate = deflateSupported()
  const parts = []
  const central = []
  let offset = 0
  for (let i = 0; i < entries.length; i++) {
    const raw = new Uint8Array(await entries[i].blob.arrayBuffer())
    const crc = crc32(raw)
    let data = raw
    let method = 0
    if (deflate) {
      const packed = await deflateRaw(raw)
      if (packed.length < raw.length) {
        data = packed
        method = 8
      }
    }
    const name = enc.encode(entries[i].name)
    const header = localHeader(name, method, crc, data.length, raw.length)
    parts.push(header, data)
    central.push(centralHeader(name, method, crc, data.length, raw.length, offset))
    offset += header.length + data.length
    onProgress?.(i + 1, entries.length)
  }
  return seal(parts, central, offset, entries.length)
}
