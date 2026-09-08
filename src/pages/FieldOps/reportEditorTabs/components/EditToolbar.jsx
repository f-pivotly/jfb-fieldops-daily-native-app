import { Button, Checkbox, Group, NumberInput } from '@mantine/core'

const DEFAULT_CLOSE_FT = 2

function ModeBtn({ active, onClick, children }) {
  return (
    <Button size="xs" variant={active ? 'filled' : 'default'} onClick={onClick}>
      {children}
    </Button>
  )
}

export default function EditToolbar({
  mode,
  onToggleMode,
  onFinishDrawing,
  showShapeControls,
  manualCount,
  removedCount,
  excludeCount,
  removedAreaCount,
  advanceCount,
  hasOverride,
  flipDisplay,
  onClearSecondEdits,
  onClearExclude,
  onClearAdvance,
  onClearRemovedAreas,
  onUndoLastRemovedArea,
  onResetPlacement,
  onToggleFlip,
  gapFt, onGapFtChange, onApplyGap,
  tolFt, onTolFtChange, onApplyTol,
  autoAdvance, onAutoAdvanceChange, onApplyAutoAdvance,
  closeFt, onCloseFtChange,
  dataSource,
  islandSqFt, onIslandSqFtChange,
  onApplyTuning,
}) {
  return (
    <>
      <Group gap={8} mb={8}>
        <ModeBtn active={mode === 'remove-second'} onClick={onToggleMode('remove-second')}>Reject 2nd pass</ModeBtn>
        <ModeBtn active={mode === 'add-second'} onClick={onToggleMode('add-second')}>Add 2nd pass</ModeBtn>
        <ModeBtn active={mode === 'remove-area'} onClick={onToggleMode('remove-area')}>Remove area (click)</ModeBtn>
        <ModeBtn active={mode === 'exclude'} onClick={onToggleMode('exclude')}>Exclude area</ModeBtn>
        <ModeBtn active={mode === 'advance'} onClick={onToggleMode('advance')}>Measure advance</ModeBtn>
        {showShapeControls && (
          <ModeBtn active={mode === 'place-cutter' || mode === 'place-stern'} onClick={onToggleMode('place-cutter')}>Move dredge</ModeBtn>
        )}
        {(mode === 'add-second' || mode === 'exclude' || mode === 'advance') && (
          <Button size="xs" color="teal" onClick={onFinishDrawing}>Done{mode === 'advance' ? ' lane' : ''}</Button>
        )}
      </Group>
      <Group gap={12} mb={8}>
        {removedAreaCount > 0 && <Button size="xs" variant="subtle" onClick={onUndoLastRemovedArea}>undo last remove</Button>}
        {removedAreaCount > 0 && <Button size="xs" variant="subtle" onClick={onClearRemovedAreas}>restore all ({removedAreaCount})</Button>}
        {(manualCount > 0 || removedCount > 0) && <Button size="xs" variant="subtle" onClick={onClearSecondEdits}>clear 2nd-pass edits</Button>}
        {excludeCount > 0 && <Button size="xs" variant="subtle" onClick={onClearExclude}>clear excluded ({excludeCount})</Button>}
        {advanceCount > 0 && <Button size="xs" variant="subtle" onClick={onClearAdvance}>clear advance ({advanceCount})</Button>}
        {hasOverride && <Button size="xs" variant="subtle" onClick={onResetPlacement}>reset dredge placement</Button>}
        {showShapeControls && <Button size="xs" variant="subtle" onClick={onToggleFlip}>flip machine{flipDisplay ? ' (flipped)' : ''}</Button>}
      </Group>
      <Group gap={16} align="flex-end">
        <NumberInput label="Gap bridge (ft)" size="xs" w={120} min={0} max={60} value={gapFt} onChange={(v) => onGapFtChange(Number(v) || 0)} />
        <Button size="xs" variant="default" onClick={onApplyGap}>Apply</Button>
        <NumberInput label="Overlap tolerance (ft)" size="xs" w={140} min={0} max={30} value={tolFt} onChange={(v) => onTolFtChange(Number(v) || 0)} />
        <Button size="xs" variant="default" onClick={onApplyTol}>Apply</Button>
        <Checkbox
          label="Auto-detect advance line"
          checked={autoAdvance}
          onChange={(ev) => onAutoAdvanceChange(ev.currentTarget.checked)}
          mb={4}
        />
        <Button size="xs" variant="default" onClick={onApplyAutoAdvance}>Apply</Button>
      </Group>
      <Group gap={16} align="flex-end" mt={12}>
        <NumberInput
          label="Sweep smoothing (ft)"
          description="Closes small gaps within today's coverage"
          size="xs" w={150} min={2} max={20}
          value={closeFt}
          onChange={(v) => onCloseFtChange(Number(v) || DEFAULT_CLOSE_FT)}
        />
        {dataSource === 'earthworks' && (
          <NumberInput
            label="Ignore stray patches under (sq ft)"
            size="xs" w={180} min={0} max={500}
            value={islandSqFt}
            onChange={(v) => onIslandSqFtChange(Number(v) || 0)}
          />
        )}
        <Button size="xs" variant="default" onClick={onApplyTuning}>
          {dataSource === 'earthworks' ? 'Apply (regenerates)' : 'Apply'}
        </Button>
      </Group>
    </>
  )
}
