const OPERATIONAL_CATEGORIES = new Set([
  'ACTIVE DREDGING',
  'DREDGING',
  'PRODUCTION',
  'ACTIVE CAPPING',
  'CAPPING',
  'ACTIVE PLACEMENT',
  'PLACEMENT',
])

export const TRANSITION_CATEGORY = 'TRANSITION'

export function normalizedCategory(category) {
  return String(category ?? '').trim()
}

export function isOperationalCategory(category) {
  const c = normalizedCategory(category)
  if (c === TRANSITION_CATEGORY) return false
  return OPERATIONAL_CATEGORIES.has(c.toUpperCase())
}
