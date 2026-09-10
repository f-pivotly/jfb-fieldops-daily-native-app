function normLabel(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function passIndex(passKey) {
  if (passKey == null) return null
  const m = String(passKey).match(/[12]/)
  return m ? (m[0] === '1' ? 1 : 2) : null
}

export function chartSfForCombo(breakdown, areaLabel, passKey) {
  const key = normLabel(areaLabel)
  if (!key) return null
  const dmu = breakdown.find((d) => normLabel(d.label) === key)
  if (!dmu) return null
  const p = passIndex(passKey)
  if (p === 1) return Math.round(dmu.firstSqFt)
  if (p === 2) return Math.round(dmu.secondSqFt)
  return Math.round((dmu.firstSqFt || 0) + (dmu.secondSqFt || 0))
}

export function chartCyForCombo(breakdown, areaLabel, passKey) {
  const key = normLabel(areaLabel)
  if (!key) return null
  const dmu = breakdown.find((d) => normLabel(d.label) === key)
  if (!dmu || dmu.adjustedCy == null) return null
  return passIndex(passKey) === 2 ? 0 : Math.round(dmu.adjustedCy)
}

export function uncoveredCoverage(breakdown, combos) {
  const covered = new Set()
  for (const c of combos) {
    if (c.timeHours <= 0.001) continue
    const k = normLabel(c.areaLabel)
    if (!k) continue
    const p = passIndex(c.passKey)
    if (p) covered.add(`${k}|${p}`)
    else { covered.add(`${k}|1`); covered.add(`${k}|2`) }
  }
  const flags = []
  for (const d of breakdown) {
    const k = normLabel(d.label)
    const passes = [[1, d.firstSqFt], [2, d.secondSqFt]]
    for (const [p, sf] of passes) {
      if (Math.round(sf) > 0 && !covered.has(`${k}|${p}`)) flags.push({ label: d.label, pass: p, sf: Math.round(sf) })
    }
  }
  return flags
}
