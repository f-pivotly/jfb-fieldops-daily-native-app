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
