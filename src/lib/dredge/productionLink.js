// Port of the reference app's src/lib/dredge/productionLink.ts. Links the
// dredge chart's per-DMU coverage to Production Stats: pull the chart's SF
// (and estimated CY) into the matching combo, and flag DMUs the chart shows
// coverage for for that no logged event time explains. Pure functions --
// no React/data-layer dependency -- ported as-is with native's field names
// (areaLabel instead of area_l1, passKey instead of pass_number).

/** Normalize a label so "DMU-1" (chart) and "DMU 1" (project area) match. */
export function normLabel(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** 1 | 2 from "1st_pass"/"1st Pass"/1/2 (first 1-or-2 digit); else null. */
export function passIndex(passKey) {
  if (passKey == null) return null
  const m = String(passKey).match(/[12]/)
  return m ? (m[0] === '1' ? 1 : 2) : null
}

/** The chart SF for a combo (matched DMU + pass). Null if the combo's area
 *  label isn't in the breakdown. A combo with no pass gets the DMU's total. */
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

/** The chart's estimated CY for a combo. Null when the DMU isn't in the
 *  breakdown or the project reports no volume. Not split by pass -- the
 *  volume model credits material above design grade on first coverage, so
 *  all of a DMU's CY belongs to its 1st pass; a 2nd pass gets zero. */
export function chartCyForCombo(breakdown, areaLabel, passKey) {
  const key = normLabel(areaLabel)
  if (!key) return null
  const dmu = breakdown.find((d) => normLabel(d.label) === key)
  if (!dmu || dmu.adjustedCy == null) return null
  return passIndex(passKey) === 2 ? 0 : Math.round(dmu.adjustedCy)
}

/** DMUs+passes with chart coverage (SF > 0) that no combo's time explains.
 *  A timed combo with a matching DMU+pass covers that pass; a timed combo
 *  with no pass covers BOTH passes of its DMU (conservative -- fewer false
 *  flags when the PE logged DMU time without a pass). */
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
