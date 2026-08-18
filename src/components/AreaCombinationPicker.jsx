import { Group, Select, Text } from '@mantine/core'
import { useAreaLevels } from '../hooks/useAreaLevels'
import { useProjectAreas } from '../hooks/useProjectAreas'

// Cascading area picker: one Select per project area-level depth, each level's
// options scoped to the previous level's selected area via parent_id — same
// tree-walk AreasTab.jsx already does for area management, reused here for
// picking (not editing) a combination. Emits a resolved root-to-leaf breadcrumb:
// [{area_level_id, area_id, label}, ...].
export default function AreaCombinationPicker({ projectId, value, onChange }) {
  const { areaLevels } = useAreaLevels(projectId)
  const { areas } = useProjectAreas(projectId)
  const selections = value ?? []

  function areaIdAt(depthIndex) {
    return selections[depthIndex]?.area_id ?? null
  }

  function optionsForLevel(levelIndex) {
    const level = areaLevels[levelIndex]
    if (!level) return []
    if (levelIndex === 0) {
      return areas.filter((a) => a.area_level_id === level.id && !a.parent_id)
    }
    const parentAreaId = areaIdAt(levelIndex - 1)
    if (!parentAreaId) return []
    return areas.filter((a) => a.area_level_id === level.id && a.parent_id === parentAreaId)
  }

  function handleSelect(levelIndex, areaId) {
    const level = areaLevels[levelIndex]
    const area = areas.find((a) => a.id === areaId)
    if (!level || !area) return
    const next = selections.slice(0, levelIndex)
    next.push({ area_level_id: level.id, area_id: area.id, label: area.name })
    onChange(next)
  }

  if (areaLevels.length === 0) {
    return <Text size="xs" c="dimmed">No area levels configured for this project.</Text>
  }

  return (
    <Group gap={6} wrap="wrap">
      {areaLevels.map((level, i) => {
        const options = optionsForLevel(i)
        const disabled = i > 0 && !areaIdAt(i - 1)
        return (
          <Select
            key={level.id}
            size="xs"
            w={150}
            placeholder={level.label}
            data={options.map((a) => ({ value: a.id, label: a.name }))}
            value={areaIdAt(i)}
            onChange={(v) => v && handleSelect(i, v)}
            disabled={disabled}
          />
        )
      })}
    </Group>
  )
}
