// Minimal ZIP writer (STORE method, no compression, no dependency). Enough to
// bundle a set of text files (e.g. progress DXFs) into one .zip download.
function crc32(bytes) {
  let crc = ~0
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

export function makeZip(files) {
  const enc = new TextEncoder()
  const u16 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255])
  const u32 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255])
  const concat = (...a) => {
    const out = new Uint8Array(a.reduce((s, x) => s + x.length, 0))
    let p = 0
    for (const x of a) { out.set(x, p); p += x.length }
    return out
  }

  const locals = []
  const central = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = enc.encode(f.text)
    const crc = crc32(data)
    const local = concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    )
    locals.push(local)
    central.push(concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), name,
    ))
    offset += local.length
  }
  const cd = concat(...central)
  const eocd = concat(
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cd.length), u32(offset), u16(0),
  )
  return new Blob([concat(...locals), cd, eocd], { type: 'application/zip' })
}
