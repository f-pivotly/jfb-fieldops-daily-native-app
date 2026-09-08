// Water Quality tab visibility. Unlike Dredge Progress (a static work_type
// check, see dredgeProgress.js), this is a fetched-config-existence gate,
// matching the non-native app's pattern: the tab shows only if the project
// has a jfb_water_monitoring_config row with active = true.
export function shouldShowWaterQuality(config) {
  return !!config && config.active === true
}
