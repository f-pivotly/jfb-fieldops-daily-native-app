export function slugifySectionKey(label) {
  const base = String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || 'section'
}


export function uniqueSectionKey(label, existingKeys) {
  const used = new Set(existingKeys)
  const base = slugifySectionKey(label)
  let key = base
  let n = 2
  while (used.has(key)) {
    key = `${base}_${n}`
    n++
  }
  return key
}
