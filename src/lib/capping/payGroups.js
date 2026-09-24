export const SF_PER_SY = 9

export function usesPayGroups(layers) {
  return (layers ?? []).some((l) => !!String(l.pay_group ?? '').trim())
}

export function payGroupsOf(layers) {
  const byName = new Map()
  const sorted = [...(layers ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  for (const l of sorted) {
    const name = String(l.pay_group ?? '').trim()
    const unit = String(l.pay_unit ?? '').trim().toUpperCase()
    if (!name || !unit) continue
    const existing = byName.get(name)
    if (existing) {
      existing.layerIds.push(l.id)
      continue
    }
    byName.set(name, {
      name,
      unit,
      layerIds: [l.id],
      rowLabel: `${name} ${unit} Placed`,
      order: l.sort_order ?? 0,
    })
  }
  return [...byName.values()]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ name: g.name, unit: g.unit, layerIds: g.layerIds, rowLabel: g.rowLabel }))
}

export function payQuantity(group, rows) {
  const ids = new Set(group.layerIds)
  let total = 0
  for (const r of rows) {
    if (!r.layerId || !ids.has(r.layerId)) continue
    if (group.unit === 'CY') total += r.volumeCy ?? 0
    else if (group.unit === 'SF') total += r.areaSf ?? 0
    else if (group.unit === 'SY') total += (r.areaSf ?? 0) / SF_PER_SY
    else if (group.unit === 'TON') total += r.tons ?? 0
  }
  return total
}

export function payQtyDecimals(unit) {
  return unit === 'SY' || unit === 'SF' ? 0 : 1
}
