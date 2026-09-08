import { useDomainData } from './useDomainData'

// jfb_air_monitoring_config has one row per project -- same existence/active
// gate pattern as useWaterMonitoringConfig.
//
// Published 2026-09-08 (WATER_AIR_QUALITY_MIGRATION_PLAN.md section 4.5) via
// Portal_Independent_Backend/scripts/create-water-air-quality-domains.ts.
export function useAirMonitoringConfig(projectId) {
  const { records, loading, error, creating, updating, create, update } =
    useDomainData({ domain: 'jfb_air_monitoring_config', system: 'core', projectId })
  return { config: records[0] ?? null, loading, error, creating, updating, create, update }
}
