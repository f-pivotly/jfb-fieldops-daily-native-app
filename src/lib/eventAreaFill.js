/**
 * Area/Pass fill-down target selection (ported from the non-native app's
 * src/lib/eventAreaFill.ts, KZ field request 2026-09-18).
 *
 * The operator often forgets to tag Area/Pass in the field app, so the PE fixes
 * the day top-down in the Edit dialog: fix activity 1 → the whole day fills;
 * fix activity 5 with the next area → 5-onward re-fills. One edit per real move.
 *
 * Rules:
 *  - Walk the day's activities in chronological order AFTER the edited one.
 *  - Blank area, or an area a PE filled before (`area_source === 'pe'`), is a
 *    TARGET — PE corrections stay fluid.
 *  - An area that arrived WITH the activity (operator-entered, or any legacy
 *    area of unknown provenance) STOPS the fill: it marks a real known state,
 *    and everything below it belongs to that state. Never overwritten.
 *  - Soft-deleted activities are skipped — neither filled nor a stop.
 *
 * Treating unknown provenance as operator-grade is what makes a missed write
 * path fail safe: the fill stops early rather than overwriting real data.
 */

function hasArea(a) {
  const area = a?.area
  if (!area || typeof area !== 'object') return false
  return ['area_id', 'sub_area_id', 'sub_sub_area_id']
    .some((k) => typeof area[k] === 'string' && area[k].trim() !== '')
}

export function compareActivitiesChrono(a, b) {
  const at = Date.parse(a.start_date_time ?? '') || 0
  const bt = Date.parse(b.start_date_time ?? '') || 0
  if (at !== bt) return at - bt
  const ae = Date.parse(a.end_date_time ?? '') || 0
  const be = Date.parse(b.end_date_time ?? '') || 0
  if (ae !== be) return ae - be
  return String(a.id).localeCompare(String(b.id))
}

export function computeAreaFillTargets(activities, editedId) {
  const sorted = (activities ?? []).slice().sort(compareActivitiesChrono)
  const start = sorted.findIndex((a) => a.id === editedId)
  if (start < 0) return []
  const targets = []
  for (let i = start + 1; i < sorted.length; i++) {
    const a = sorted[i]
    if (a.is_deleted) continue
    if (hasArea(a) && a.area_source !== 'pe') break
    targets.push(a)
  }
  return targets
}
