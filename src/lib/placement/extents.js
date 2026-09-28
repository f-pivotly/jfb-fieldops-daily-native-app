function shoelace(ring) {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

const round3 = (v) => Math.round(v * 1000) / 1000

export function parseExtentsDxf(txt) {
  const raw = txt.split(/\r?\n/)
  const pairs = []
  for (let i = 0; i + 1 < raw.length; i += 2) pairs.push([raw[i].trim(), raw[i + 1]])
  let i = 0
  while (i < pairs.length && !(pairs[i][0] === '2' && pairs[i][1].trim() === 'ENTITIES')) i++

  const rings = []
  for (; i < pairs.length; i++) {
    if (pairs[i][0] !== '0' || (pairs[i][1] || '').trim() !== 'LWPOLYLINE') continue
    const pts = []
    let j = i + 1
    for (; j < pairs.length && pairs[j][0] !== '0'; j++) {
      const [code, value] = pairs[j]
      if (code === '10') pts.push([round3(parseFloat(value)), NaN])
      else if (code === '20' && pts.length) pts[pts.length - 1][1] = round3(parseFloat(value))
    }
    i = j - 1
    let ring = pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    const last = ring[ring.length - 1]
    if (ring.length > 1 && ring[0][0] === last[0] && ring[0][1] === last[1]) ring = ring.slice(0, -1)
    if (ring.length >= 3 && shoelace(ring) > 1) rings.push(ring)
  }

  if (!rings.length) return null
  const sqFt = Math.round(rings.reduce((sum, r) => sum + shoelace(r), 0) * 10) / 10
  return { rings, sqFt }
}
