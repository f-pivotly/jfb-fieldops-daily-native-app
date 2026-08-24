// Decimal precision per unit, matching the old (non-native) app's
// fmtMetricValue() rules (METRICS_MIGRATION_PLAN.md §1) — unit-driven, not
// metric-specific.
const UNIT_DECIMALS = {
  CY: 1,
  SF: 0,
  hrs: 2,
  '%': 2,
}

export function formatMetricValue(value, unit) {
  const decimals = UNIT_DECIMALS[unit] ?? 2
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
