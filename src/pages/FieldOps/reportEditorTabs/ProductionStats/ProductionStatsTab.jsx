import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, SimpleGrid, Text } from '@mantine/core'
import WarningBanner from '../components/WarningBanner'
import { useProductionStats } from '../../../../hooks/production/useProductionStats'
import { useProjectAreas } from '../../../../hooks/project/useProjectAreas'
import { useAreaLevels } from '../../../../hooks/project/useAreaLevels'
import { useProjectAttachments } from '../../../../hooks/project/useProjectAttachments'
import { useProjectLayers } from '../../../../hooks/capping/useProjectLayers'
import { useProjectMaterials } from '../../../../hooks/capping/useProjectMaterials'
import { useProjectLayerMaterials } from '../../../../hooks/capping/useProjectLayerMaterials'
import { useConfirmDialog } from '../../../../hooks/ui/useConfirmDialog'
import { usePicklist } from '../../../../hooks/core/usePicklist'
import { equipmentWorkType, isProductiveActivity } from '../../lib/workType'
import { useDomainData } from '../../../../hooks/core/useDomainData'
import { useDayActivities } from '../../../../hooks/production/useDayActivities'
import { useComboProduction } from '../../../../hooks/production/useComboProduction'
import { FlowStatsPanel, PipeConfigPanel } from './FlowStatsPanel'
import BucketSfControls from './BucketSfControls'
import ChartSfControls from './ChartSfControls'
import CappingProductionTable from './CappingProductionTable'
import DredgeProductionTable from './DredgeProductionTable'
import UnassignedBanner from './UnassignedBanner'
import { usePlacementConfig } from '../../../../hooks/placement/usePlacementConfig'
import { loadPlacementGrid } from '../../../../lib/placement/loaders'
import { attributeBuckets, windowsFromActivities } from '../../../../lib/placement/attribution'
import LoadingSpinner from '../../../../components/LoadingSpinner'
import SafeError from '../../../../components/SafeError'

export default function ProductionStatsTab({ project, report, equipment = [], selectedEquipmentId }) {
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const { stats, loading, error, update, remove, create } = useProductionStats(report?.id)
  const { areas, loading: areasLoading } = useProjectAreas(project?.id)
  const { areaLevels } = useAreaLevels(project?.id)
  const areaLabels = [...areaLevels]
    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
    .map((l) => l.label)
  const { attachments } = useProjectAttachments(project?.id)
  const { labels: passTypeLabels } = usePicklist('pkl-jfb-pass-type')

  const selectedEquipment = equipment.find((eq) => eq.id === selectedEquipmentId) ?? null
  const resolvedWorkType = equipmentWorkType(project, selectedEquipment, report?.report_date).toLowerCase()
  const isCapping = resolvedWorkType.includes('cap')
  const workTypeUnset = resolvedWorkType.trim() === ''
  const { layers } = useProjectLayers(project?.id)
  const { materials } = useProjectMaterials(project?.id)
  const { layerMaterials } = useProjectLayerMaterials(project?.id)

  const rows = stats.filter((s) => s.equipment_id === selectedEquipmentId)

  const activities = useDayActivities({
    projectId: project?.id,
    reportDate: report?.report_date,
    equipmentId: selectedEquipmentId,
  })
  const activitiesLoading = activities === null

  const { records: dredgeProgressRecords } = useDomainData({ domain: 'jfb_dredge_progress', system: 'core', reportId: report?.id })
  const { records: dredgeConfigRecords } = useDomainData({ domain: 'jfb_dredge_config', system: 'core', projectId: project?.id })
  const dredgeProgress = dredgeProgressRecords.find((r) => r.equipment_id === selectedEquipmentId) ?? null
  const chartBreakdown = dredgeProgress?.cell_breakdown ?? []
  const chartTodaySf = dredgeProgress?.today_sqft ?? null
  const chartTodayCy = dredgeProgress?.adjusted_cy ?? null
  const volumeOn = (dredgeConfigRecords[0]?.volume_mode ?? null) != null

  const areasById = new Map(areas.map((a) => [a.id, a]))
  const attachmentsById = new Map(attachments.map((a) => [a.id, a]))

  const { config: placementConfig } = usePlacementConfig(isCapping ? project?.id : null)
  const placementGridFileId = placementConfig?.grid_path ?? null
  const placementGridRef = useRef(null)
  const [placementGrid, setPlacementGrid] = useState(null)
  useEffect(() => {
    let alive = true
    const load = placementGridFileId
      ? loadPlacementGrid(placementGridFileId, placementGridRef)
      : Promise.resolve(null)
    load
      .then((g) => { if (alive) setPlacementGrid(g) })
      .catch(() => { if (alive) setPlacementGrid(null) })
    return () => { alive = false }
  }, [placementGridFileId])

  const { records: placementRows } = useDomainData({
    domain: 'jfb_placement_progress', system: 'core', reportId: isCapping ? report?.id : null,
  })

  const placementRow = (placementRows ?? []).find((r) => r.equipment_id === selectedEquipmentId) ?? null

  const layerNameById = useMemo(() => new Map((layers ?? []).map((l) => [l.id, l.layer_name])), [layers])

  const bucketCoverage = useMemo(() => {
    const placements = placementRow?.placements ?? []
    if (!placementGrid || placements.length === 0) return null
    const windows = windowsFromActivities(activities ?? [], layerNameById, isProductiveActivity)
    return attributeBuckets(placements, placementGrid, windows)
  }, [placementRow, placementGrid, activities, layerNameById])

  async function fillBucketSf(row, sf) {
    await update(row.id, { area: sf })
  }

  const combo = useComboProduction({
    report,
    selectedEquipmentId,
    activities,
    rows,
    areasById,
    attachmentsById,
    passTypeLabels,
    create,
    update,
  })

  const isHydraulic = resolvedWorkType.includes('hydraulic')
  const showFlowAndPipe = !!project?.is_pipe_tracking && isHydraulic
  const capFactorMissing = project?.cap_conversion_factor == null
  const stillLoading = loading || areasLoading || (!isCapping && activitiesLoading)

  return (
    <Box>
      {stillLoading && <LoadingSpinner py={16} />}
      {!stillLoading && <SafeError message={error} />}

      {!stillLoading && !error && workTypeUnset && (
        <WarningBanner p={10} mb={10}>
          <Text size="xs" fw={600} c="#7a5206">No work type set for this project</Text>
          <Text size="xs" c="#7a5206">
            Showing dredging entry by default. Set the work type in <strong>Project Settings</strong> so this
            screen matches the work being done.
          </Text>
        </WarningBanner>
      )}

      {!stillLoading && !error && <UnassignedBanner activities={activities} />}

      {!stillLoading && !error && !isCapping && (
        <ChartSfControls
          combos={combo.combos}
          persistedByKey={combo.persistedByKey}
          persistCombo={combo.persistCombo}
          chartBreakdown={chartBreakdown}
          chartTodaySf={chartTodaySf}
          chartTodayCy={chartTodayCy}
          volumeOn={volumeOn}
          confirm={confirm}
        />
      )}

      {!stillLoading && !error && isCapping && (
        <>
          {capFactorMissing && (
            <WarningBanner p={10} mb={10}>
              <Text size="xs">
                No project conversion factor set — set the tons/CY factor on this project's{' '}
                <strong>Settings</strong> page so it pre-fills, or enter it per row below. CY can&apos;t compute
                until a factor is entered. Projects paid by the ton can leave this blank.
              </Text>
            </WarningBanner>
          )}
          {bucketCoverage && (
            <BucketSfControls
              coverage={bucketCoverage}
              rows={rows}
              layerNameById={layerNameById}
              onFillSf={fillBucketSf}
              confirm={confirm}
            />
          )}
          <CappingProductionTable
            project={project}
            report={report}
            rows={rows}
            activities={activities}
            layers={layers}
            materials={materials}
            layerMaterials={layerMaterials}
            areasById={areasById}
            selectedEquipmentId={selectedEquipmentId}
            create={create}
            update={update}
            remove={remove}
            confirm={confirm}
          />
        </>
      )}

      {!stillLoading && !error && !isCapping && (
        <DredgeProductionTable
          combos={combo.combos}
          totals={combo.comboTotals}
          areaLabels={areaLabels}
          useTsca={!!project?.is_tsca_zone_tracking}
          cellValue={combo.comboCellValue}
          setCellValue={combo.setComboCellValue}
          flushCell={combo.flushCombo}
          saveState={combo.comboSaveState}
        />
      )}

      {showFlowAndPipe && report?.report_date && (
        <SimpleGrid cols={{ base: 1, md: 2 }} mt={16}>
          <FlowStatsPanel
            key={`${selectedEquipmentId}:${report.report_date}`}
            projectId={project.id}
            equipmentId={selectedEquipmentId}
            reportDateISO={report.report_date}
            nohHours={combo.comboTotals.noh}
          />
          <PipeConfigPanel key={report.report_date} projectId={project.id} reportDateISO={report.report_date} />
        </SimpleGrid>
      )}

      {confirmModal}
    </Box>
  )
}
