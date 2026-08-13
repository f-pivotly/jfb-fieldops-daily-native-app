import { useDomainData } from './useDomainData'

export function useAreaLevels(projectId) {
  const { records, loading, error } = useDomainData({ domain: 'jfb_project_area_levels', system: 'core' })
  const areaLevels = (projectId ? records.filter((l) => l.project_id === projectId) : records)
    .slice()
    .sort((a, b) => (a.sort_order ?? a.depth) - (b.sort_order ?? b.depth))
  return { areaLevels, loading, error }
}
