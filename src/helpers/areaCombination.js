export function comboLabel(combo) {
  return Array.isArray(combo) && combo.length ? combo.map((c) => c.label).join(' › ') : '—'
}

export function sameCombo(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}
