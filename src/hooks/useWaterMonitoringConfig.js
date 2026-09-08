import { useDomainData } from './useDomainData'

// jfb_water_monitoring_config has one row per project. Its existence (and
// active flag) is the Water Quality tab's visibility gate -- see
// shouldShowWaterQuality in ../config/waterMonitoring.js.
//
// Published 2026-09-08 (WATER_AIR_QUALITY_MIGRATION_PLAN.md section 4.5) via
// Portal_Independent_Backend/scripts/create-water-air-quality-domains.ts.
export function useWaterMonitoringConfig(projectId) {
  const { records, loading, error, creating, updating, create, update } =
    useDomainData({ domain: 'jfb_water_monitoring_config', system: 'core', projectId })
  return { config: records[0] ?? null, loading, error, creating, updating, create, update }
}
