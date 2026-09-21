import { makeListHook } from '../core/domainHookFactory'

function bySortOrder(records) {
  return records.slice().sort((a, b) => (a.sort_order ?? a.depth) - (b.sort_order ?? b.depth))
}

export const useAreaLevels = makeListHook('jfb_project_area_levels', 'areaLevels', 'project', bySortOrder)
