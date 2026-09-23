export function isDirectImageUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}
