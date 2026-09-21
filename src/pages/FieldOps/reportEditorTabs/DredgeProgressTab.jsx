import { useState } from 'react'
import { Box, Button, Checkbox, Group, Stack, Text } from '@mantine/core'
import WarningBanner from './components/WarningBanner'
import ReasonDialog from '../../../components/ReasonDialog'
import SafeError from '../../../components/SafeError'
import { batchFingerprint, batchDateWarning, readStoredBatch } from '../../../lib/dredge/rawBatch'
import { dredgeFileName } from '../../../lib/dredge/fileNames'
import { downloadAttachment } from '../../../data'
import { useDomainData } from '../../../hooks/core/useDomainData'
import { useProjectAreas } from '../../../hooks/project/useProjectAreas'
import { useDredgeEquipmentConfig } from '../../../hooks/dredge/useDredgeEquipmentConfig'
import { useAppConfig } from '../../../contexts/appConfigContext'
import { useDredgeCellStatus } from '../../../hooks/dredge/useDredgeCellStatus'
import { useDredgeChartEngine } from '../../../hooks/dredge/useDredgeChartEngine'
import { useDredgeChartGenerate } from '../../../hooks/dredge/useDredgeChartGenerate'
import { useDredgeProgressSave } from '../../../hooks/dredge/useDredgeProgressSave'
import GenerateForm from './components/GenerateForm'
import ChartStatsSummary from './components/ChartStatsSummary'
import EditToolbar from './components/EditToolbar'
import CellChipsPanel from './components/CellChipsPanel'

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

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
  const [confirmingReplace, setConfirmingReplace] = useState(false)
  const [batchBusy, setBatchBusy] = useState('')
  const [batchError, setBatchError] = useState(null)
  const [showBatchFiles, setShowBatchFiles] = useState(false)

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
    rawFiles: files,
  })
  const { saving, saved, saveError, savePhase, resetSaveState, handleSave } = save

  const savedBatchChecksum = existingProgressRecord?.source_batch_info?.checksum ?? null
  const isReplacingBatch =
    files.length > 0 && !!savedBatchChecksum && batchFingerprint(files) !== savedBatchChecksum
  const batchWarning = files.length ? batchDateWarning(files, report?.report_date) : ''

  const storedBatchPath = existingProgressRecord?.source_batch_path ?? null
  const storedBatch = existingProgressRecord?.source_batch_info ?? null

  const storedBatchName = () => dredgeFileName({
    project, kind: 'dredge-raw', dateISO: report?.report_date, equipment: selected, ext: 'zip',
  })

  const handleDownloadStoredBatch = async () => {
    setBatchError(null)
    setBatchBusy('download')
    try {
      saveBlob(await downloadAttachment(storedBatchPath), storedBatchName())
    } catch (err) {
      setBatchError(err.message)
    } finally {
      setBatchBusy('')
    }
  }

  const handleLoadStoredBatch = async () => {
    setBatchError(null)
    setBatchBusy('load')
    try {
      handleFilesChange(await readStoredBatch(storedBatchPath))
    } catch (err) {
      setBatchError(err.message)
    } finally {
      setBatchBusy('')
    }
  }

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
        />
        <ChartStatsSummary
          lastResult={lastResult}
          priorAdvanceFt={priorAdvanceFt}
          refSurfaceError={refSurfaceError}
          notice={notice}
          dateWarning={dateWarning || batchWarning}
          error={error}
          saveError={saveError}
        />
      </Box>

      {storedBatchPath && (
        <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={4}>Stored source files</Text>
          <Text size="xs" c="dimmed" mb={10}>
            {storedBatch?.file_count ?? '—'} file(s) · {formatSize(storedBatch?.total_bytes)} ({formatSize(storedBatch?.compressed_bytes)} compressed)
            {storedBatch?.source_date ? ` · dated ${storedBatch.source_date}` : ''}
            {storedBatch?.uploaded_at ? ` · saved ${storedBatch.uploaded_at.slice(0, 10)}` : ''}
          </Text>
          <Group gap={10}>
            <Button
              size="xs"
              variant="default"
              loading={batchBusy === 'download'}
              disabled={!!batchBusy}
              onClick={handleDownloadStoredBatch}
            >
              Download zip
            </Button>
            <Button
              size="xs"
              variant="default"
              loading={batchBusy === 'load'}
              disabled={!!batchBusy || generating}
              onClick={handleLoadStoredBatch}
            >
              Load stored files
            </Button>
            {!!storedBatch?.file_names?.length && (
              <Text
                size="xs"
                c="blue"
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => setShowBatchFiles((v) => !v)}
              >
                {showBatchFiles ? 'Hide file list' : 'Show file list'}
              </Text>
            )}
          </Group>
          <Text size="10px" c="dimmed" mt={6}>
            Loading puts the stored files back in the picker so the day can be charted again without the original folder.
            Manual edits from the saved chart are not replayed.
          </Text>
          {showBatchFiles && (
            <Box mt={8} p={8} mah={160} style={{ overflowY: 'auto', background: 'var(--mantine-color-gray-0)', borderRadius: 4 }}>
              {storedBatch.file_names.map((name) => (
                <Text key={name} size="10px" c="dimmed">{name}</Text>
              ))}
            </Box>
          )}
          <SafeError message={batchError} />
        </Box>
      )}

      {generated && (
        <Box p={16} style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
          <EditToolbar
            mode={mode}
            onToggleMode={toggleMode}
            onFinishDrawing={finishDrawing}
            placeLabel={effectiveConfig?.data_source === 'earthworks' ? 'Place machine' : 'Move dredge'}
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
          {isReplacingBatch && (
            <WarningBanner mt={12} p={10}>
              <Text size="xs">
                Saving will replace the {existingProgressRecord?.source_batch_info?.file_count ?? 0} source
                file(s) already stored for this day with the {files.length} now selected. The saved chart and
                totals are recomputed from the new batch.
              </Text>
            </WarningBanner>
          )}
          <Group gap={10} mt={12}>
            <Button
              size="xs"
              variant="light"
              disabled={saving}
              loading={saving}
              onClick={() => (isReplacingBatch ? setConfirmingReplace(true) : handleSave())}
            >
              {existingProgressRecord ? 'Update saved progress' : 'Save to report'}
            </Button>
            <Button size="xs" variant="default" onClick={handleDownloadDxf}>Download DXF</Button>
            <Button size="xs" variant="default" onClick={handleDownloadPng}>Download PNG</Button>
            {saving && savePhase && <Text size="xs" c="dimmed">{savePhase}</Text>}
            {saved && <Text size="xs" c="teal">✓ Saved to report</Text>}
          </Group>
          <ReasonDialog
            opened={confirmingReplace}
            onClose={() => setConfirmingReplace(false)}
            title="Replace stored source files?"
            label="Why are these files being replaced?"
            placeholder="e.g. wrong folder picked, survey re-exported"
            confirmLabel="Replace and save"
            onConfirm={(reason) => {
              setConfirmingReplace(false)
              handleSave({ replaceReason: reason })
            }}
          />
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
