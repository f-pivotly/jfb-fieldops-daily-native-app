import { useState } from 'react'
import { Box, Button, Checkbox, Group, Stack, Text } from '@mantine/core'
import WarningBanner from './components/WarningBanner'
import { useDomainData } from '../../../hooks/useDomainData'
import { useProjectAreas } from '../../../hooks/useProjectAreas'
import { useDredgeEquipmentConfig } from '../../../hooks/useDredgeEquipmentConfig'
import { useAppConfig } from '../../../contexts/appConfigContext'
import { useDredgeCellStatus } from './hooks/useDredgeCellStatus'
import { useDredgeChartEngine } from './hooks/useDredgeChartEngine'
import { useDredgeChartGenerate } from './hooks/useDredgeChartGenerate'
import { useDredgeProgressSave } from './hooks/useDredgeProgressSave'
import GenerateForm from './components/GenerateForm'
import ChartStatsSummary from './components/ChartStatsSummary'
import EditToolbar from './components/EditToolbar'
import CellChipsPanel from './components/CellChipsPanel'

const MODE_HINTS = {
  'add-second': (n) => `Click to outline a 2nd-pass area (${n} point${n === 1 ? '' : 's'}), then Done.`,
  'remove-second': () => 'Click a proposed 2nd-pass (olive) area to reject it back to incidental.',
  'remove-area': () => 'Click any coverage patch that is NOT real dredging -- the whole connected patch is removed. Click each patch to remove; Remove area again to finish.',
  exclude: (n) => `Outline area to EXCLUDE from coverage (${n} point${n === 1 ? '' : 's'}), then Done.`,
  advance: (n) => `Click down the CENTER of the dredge lane (${n} point${n === 1 ? '' : 's'}), then Done. One line per lane -- repeat for each lane; lengths add up.`,
  'place-cutter': () => 'Click where the cutter/bucket is right now.',
  'place-stern': () => 'Now click the stern/tail end, to set the heading.',
}

export default function DredgeProgressTab({ project, report, reports, equipment, selectedEquipmentId }) {
  const selected = equipment.find((e) => e.id === selectedEquipmentId)
  const { config } = useAppConfig()

  const { records: dredgeConfigRecords, loading: configLoading } =
    useDomainData({ domain: 'jfb_dredge_config', system: 'core', projectId: project?.id })
  const { records: progressRecords, loading: progressLoading, create: createProgress, update: updateProgress, reload: reloadProgress } =
    useDomainData({ domain: 'jfb_dredge_progress', system: 'core', projectId: project?.id })
  const { areas } = useProjectAreas(project?.id)
  const areaNameById = new Map((areas ?? []).map((a) => [a.id, a.name]))
  const { equipmentConfigs } = useDredgeEquipmentConfig(project?.id)
  const equipmentConfig = (equipmentConfigs ?? []).find((c) => c.equipment_id === selectedEquipmentId) ?? null

  const effectiveConfig = dredgeConfigRecords[0] ?? null

  const [stationFrom, setStationFrom] = useState('')
  const [stationTo, setStationTo] = useState('')
  const [materialText, setMaterialText] = useState('')
  const [recovery, setRecovery] = useState('')
  const [activeCellLabels, setActiveCellLabels] = useState([])

  const displayedRecovery = recovery !== '' ? recovery : (effectiveConfig?.volume_recovery_factor ?? '')

  const reportDateById = new Map((reports ?? []).map((r) => [r.id, r.report_date]))
  const priorProgressRows = (progressRecords ?? []).filter((row) => {
    if (row.equipment_id !== selected?.id) return false
    const rowDate = reportDateById.get(row.report_id)
    return !!rowDate && !!report?.report_date && rowDate < report.report_date
  })
  const priorRings = priorProgressRows.flatMap((row) => row.footprint_rings ?? row.coverage_rings ?? [])
  const priorAdvanceFt = priorProgressRows.reduce((sum, row) => sum + Number(row.advance_ft || 0), 0)
  const latestPriorMaterialText = priorProgressRows
    .slice()
    .sort((a, b) => (reportDateById.get(b.report_id) || '').localeCompare(reportDateById.get(a.report_id) || ''))[0]
    ?.material_text ?? ''
  const existingProgressRecord = (progressRecords ?? []).find(
    (row) => row.report_id === report?.id && row.equipment_id === selected?.id,
  )
  const displayedMaterialText = materialText !== ''
    ? materialText
    : (existingProgressRecord?.material_text || latestPriorMaterialText || effectiveConfig?.default_material_note || '')

  const cellStatus = useDredgeCellStatus(project?.id, report?.report_date)
  const {
    cellStatusBusy,
    isCellEffectivelyComplete,
    completedCellLabels,
    toggleCellComplete,
    confirmModal,
  } = cellStatus

  const engine = useDredgeChartEngine({
    effectiveConfig, project, report, equipmentConfig, selected, selectedEquipmentId,
    areaNameById, priorRings, completedCellLabels,
    displayedMaterialText, recovery, stationFrom, stationTo, activeCellLabels,
  })
  const {
    canvasRef, editRef, lastResult, mode, drawCount, manualCount, removedCount, excludeCount, removedAreaCount, advanceCount,
    gapFt, setGapFt, tolFt, setTolFt, autoAdvance, setAutoAdvance, closeFt, setCloseFt, islandSqFt, setIslandSqFt,
    hasOverride, flipDisplay,
    runRender, handleCanvasClick, finishDrawing, toggleMode,
    clearExclude, clearRemovedAreas, undoLastRemovedArea, clearAdvance, clearSecondEdits,
    applyGap, applyTol, applyAutoAdvance, applyActiveCells,
    resetPlacement, toggleFlip, resetEdits,
    handleDownloadDxf, handleDownloadPng,
    todayPtsRef, headingsRef, todayCoverageRingsRef, imagesRef, refSurfaceRef, dredgeShapeRef, surfaceDiffRef,
  } = engine

  const generate = useDredgeChartGenerate({
    refs: { todayPtsRef, headingsRef, todayCoverageRingsRef, imagesRef, refSurfaceRef, dredgeShapeRef, surfaceDiffRef },
    runRender, resetEdits,
    effectiveConfig, report, equipmentConfig, selected,
    progressRecords, reportDateById,
    closeFt, islandSqFt,
    setActiveCellLabels,
  })
  const {
    files, generating, generated, error, notice, dateWarning, progressMsg, refSurfaceError, cellsList,
    clusterWindows, splitViews, setSplitViews, previewIdx,
    handleFilesChange: generateFilesChange, handleGenerate: generateChart, previewView,
  } = generate

  const save = useDredgeProgressSave({
    project, report, selected, userId: config?.user?.id,
    existingProgressRecord, createProgress, updateProgress, reloadProgress,
    displayedMaterialText,
    lastResult, editRef, canvasRef, runRender,
    surfaceDiffRef,
    clusterWindows, splitViews,
    resetPreview: () => previewView(null),
  })
  const { saving, saved, saveError, resetSaveState, handleSave } = save

  if (configLoading) {
    return <Text size="xs" c="dimmed" ta="center" py={24}>Loading dredge chart configuration…</Text>
  }

  if (!effectiveConfig) {
    return (
      <Box
        p={32}
        style={{
          border: '1px dashed var(--mantine-color-gray-4)',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <Text size="sm" c="dimmed">
          This dredge isn't configured for charts yet. A PM/Admin can set it up under{' '}
          <Text span fw={500} c="dimmed" inherit>Project Settings → Dredge Chart</Text>{' '}
          (background, georeference, and the dredge shape).
        </Text>
      </Box>
    )
  }

  const handleFilesChange = (newFiles) => {
    generateFilesChange(newFiles)
    resetEdits(false)
    resetSaveState()
  }
  const handleGenerate = async () => {
    resetSaveState()
    await generateChart()
  }
  const applyTuning = () =>
    (effectiveConfig?.data_source === 'earthworks' ? handleGenerate() : runRender())

  const stationsMissing = !!effectiveConfig?.require_stations && (!stationFrom.trim() || !stationTo.trim())
  const canGenerate = files.length > 0 && !!report?.report_date && !!selected && !progressLoading && !generating && !stationsMissing
  const editing = mode !== 'view'
  const hint = MODE_HINTS[mode]?.(drawCount) ?? ''

  return (
    <Stack gap="md">
      {confirmModal}
      <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
        <Text fw={600} size="sm" mb={4}>{selected ? selected.name : 'Select equipment'}</Text>
        <Text size="xs" c="dimmed" mb={12}>
          {effectiveConfig?.data_source === 'earthworks'
            ? "Select the day's Tracking .dxf and/or surface .csv (either alone, or both -- the track drives the border, the CSV gives digging tolerance)."
            : "Select the day's RAW folder. Only the cutter track is read; non-RAW files are ignored."}
        </Text>
        <GenerateForm
          requireStations={!!effectiveConfig?.require_stations}
          onFilesChange={handleFilesChange}
          fileCount={files.length}
          stationFrom={stationFrom} onStationFromChange={setStationFrom}
          stationTo={stationTo} onStationToChange={setStationTo}
          canGenerate={canGenerate} generating={generating} onGenerate={handleGenerate}
          progressMsg={progressMsg}
          showRecoveryInput={effectiveConfig?.volume_mode === 'design_grade' || effectiveConfig?.volume_mode === 'surface_diff'}
          recoveryValue={displayedRecovery} onRecoveryChange={setRecovery}
          materialText={displayedMaterialText} onMaterialTextChange={setMaterialText}
          generated={generated} isUpdate={!!existingProgressRecord}
          saving={saving} onSave={handleSave}
          onDownloadDxf={handleDownloadDxf} onDownloadPng={handleDownloadPng}
        />
        <ChartStatsSummary
          lastResult={lastResult}
          priorAdvanceFt={priorAdvanceFt}
          refSurfaceError={refSurfaceError}
          saved={saved}
          notice={notice}
          dateWarning={dateWarning}
          error={error}
          saveError={saveError}
        />
      </Box>

      {generated && (
        <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
          <EditToolbar
            mode={mode}
            onToggleMode={toggleMode}
            onFinishDrawing={finishDrawing}
            showShapeControls={!!equipmentConfig?.shape_path}
            manualCount={manualCount}
            removedCount={removedCount}
            excludeCount={excludeCount}
            removedAreaCount={removedAreaCount}
            advanceCount={advanceCount}
            hasOverride={hasOverride}
            flipDisplay={flipDisplay}
            onClearSecondEdits={clearSecondEdits}
            onClearExclude={clearExclude}
            onClearAdvance={clearAdvance}
            onClearRemovedAreas={clearRemovedAreas}
            onUndoLastRemovedArea={undoLastRemovedArea}
            onResetPlacement={resetPlacement}
            onToggleFlip={toggleFlip}
            gapFt={gapFt} onGapFtChange={setGapFt} onApplyGap={applyGap}
            tolFt={tolFt} onTolFtChange={setTolFt} onApplyTol={applyTol}
            autoAdvance={autoAdvance} onAutoAdvanceChange={setAutoAdvance} onApplyAutoAdvance={applyAutoAdvance}
            closeFt={closeFt} onCloseFtChange={setCloseFt}
            dataSource={effectiveConfig?.data_source}
            islandSqFt={islandSqFt} onIslandSqFtChange={setIslandSqFt}
            onApplyTuning={applyTuning}
          />
          <CellChipsPanel
            cellsList={cellsList}
            activeCellLabels={activeCellLabels}
            onActiveCellLabelsChange={setActiveCellLabels}
            onApplyActiveCells={applyActiveCells}
            dataSource={effectiveConfig?.data_source}
            isCellEffectivelyComplete={isCellEffectivelyComplete}
            toggleCellComplete={toggleCellComplete}
            cellStatusBusy={cellStatusBusy}
          />
          {clusterWindows.length >= 2 && (
            <WarningBanner mt={12} p={10}>
              <Checkbox
                label={`Split into ${clusterWindows.length} focused views (large move detected)`}
                checked={splitViews}
                onChange={(ev) => {
                  const checked = ev.currentTarget.checked
                  setSplitViews(checked)
                  if (!checked) previewView(null)
                }}
              />
              <Text size="10px" c="dimmed" mt={4}>
                The full day is saved either way — this only changes the saved chart to {clusterWindows.length} zoomed images, one per work area, instead of a single wide view.
              </Text>
              {splitViews && (
                <Group gap={6} mt={8}>
                  <Text size="10px" c="dimmed">Preview:</Text>
                  {clusterWindows.map((_, i) => (
                    <Button key={i} size="xs" variant={previewIdx === i ? 'filled' : 'default'} onClick={() => previewView(i)}>
                      View {i + 1}
                    </Button>
                  ))}
                  <Button size="xs" variant={previewIdx === null ? 'filled' : 'default'} onClick={() => previewView(null)}>
                    Full day
                  </Button>
                </Group>
              )}
            </WarningBanner>
          )}
          {hint && <Text size="xs" c="dimmed" mt={8}>{hint}</Text>}
        </Box>
      )}

      <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, textAlign: 'center' }}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ maxWidth: '100%', height: 'auto', display: generated ? 'inline-block' : 'none', cursor: editing ? 'crosshair' : 'default' }}
        />
        {!generated && <Text size="xs" c="dimmed" py={24}>The generated chart will appear here.</Text>}
      </Box>
    </Stack>
  )
}
