import { useMemo } from 'react'
import { useDomainData } from './useDomainData'
import { reportWindowUtc } from '../lib/waterQuality/data'

// jfb_water_quality_readings, scoped to one report date's monitoring
// window. The domain has no date-range query support (useDomainData only
// does flat equality filters), so this fetches the full project history
// via project_id and filters client-side by config.window_start/end --
// per WATER_AIR_QUALITY_MIGRATION_PLAN.md section 4.3. Fine at this data
// volume (15-min interval x a few weeks, one project).
export function useWaterQualityReadings(config, dateISO) {
  const { records, loading, error } = useDomainData({
    domain: 'jfb_water_quality_readings',
    system: 'core',
    projectId: config?.project_id,
  })
  const readings = useMemo(() => {
    if (!config || !dateISO || !records.length) return []
    const { startUtc, endUtc } = reportWindowUtc(config, dateISO)
    const startMs = startUtc.getTime()
    const endMs = endUtc.getTime()
    return records.filter((r) => {
      const t = Date.parse(r.reading_at)
      return t >= startMs && t <= endMs
    })
  }, [records, config, dateISO])
  return { readings, loading, error }
}
