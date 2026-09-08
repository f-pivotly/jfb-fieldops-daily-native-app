// Air Quality tab visibility -- matches the reference app exactly: shown
// whenever the project has a jfb_air_monitoring_config row at all, full
// stop. No separate active flag (that was a native-only addition with no
// reference equivalent, removed to avoid a config row silently hiding the
// tab if a migrated/seeded row ever defaulted it to false).
export function shouldShowAirQuality(config) {
  return !!config
}
