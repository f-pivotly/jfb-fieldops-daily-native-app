import { Box, Button, Checkbox, Group, Slider, Text } from '@mantine/core'

function ModeBtn({ active, onClick, children }) {
  return (
    <Button size="xs" variant={active ? 'filled' : 'default'} onClick={onClick}>
      {children}
    </Button>
  )
}

function TuneSlider({ label, unit, value, onChange, onChangeEnd, min, max, step, w = 160 }) {
  return (
    <Box w={w}>
      <Group gap={6} justify="space-between" mb={2}>
        <Text size="sm" c="dimmed">{label}</Text>
        <Text size="sm" c="dimmed">{value} {unit}</Text>
      </Group>
      <Slider
        size="sm" min={min} max={max} step={step} value={value} label={null}
        onChange={onChange} onChangeEnd={onChangeEnd}
      />
    </Box>
  )
}

export default function EditToolbar({
  mode,
  onToggleMode,
  onFinishDrawing,
  placeLabel,
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
        <Text size="xs" tt="uppercase" c="dimmed" fw={600} mr={4}>Adjust</Text>
        <ModeBtn active={mode === 'place-cutter' || mode === 'place-stern'} onClick={onToggleMode('place-cutter')}>{placeLabel}</ModeBtn>
        <ModeBtn active={mode === 'remove-second'} onClick={onToggleMode('remove-second')}>Reject 2nd pass</ModeBtn>
        <ModeBtn active={mode === 'add-second'} onClick={onToggleMode('add-second')}>Add 2nd pass</ModeBtn>
        <ModeBtn active={mode === 'remove-area'} onClick={onToggleMode('remove-area')}>Remove area (click)</ModeBtn>
        <ModeBtn active={mode === 'exclude'} onClick={onToggleMode('exclude')}>Exclude area</ModeBtn>
        <ModeBtn active={mode === 'advance'} onClick={onToggleMode('advance')}>Measure advance</ModeBtn>
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
        {hasOverride && <Button size="xs" variant="subtle" onClick={onToggleFlip}>flip machine{flipDisplay ? ' (flipped)' : ''}</Button>}
        <Checkbox
          label={`Auto-propose advance line${advanceCount > 0 ? ' (using drawn lanes)' : ''}`}
          checked={autoAdvance}
          disabled={advanceCount > 0}
          onChange={(ev) => { onAutoAdvanceChange(ev.currentTarget.checked); onApplyAutoAdvance() }}
          ml={4}
        />
      </Group>
      <Group gap={24} align="flex-start">
        <TuneSlider
          label="Overlap tolerance" unit="ft" min={0} max={20} step={1}
          value={tolFt} onChange={onTolFtChange} onChangeEnd={onApplyTol}
        />
        <TuneSlider
          label="Gap bridge" unit="ft" min={0} max={60} step={5}
          value={gapFt} onChange={onGapFtChange} onChangeEnd={onApplyGap}
        />
        {dataSource === 'earthworks' ? (
          <TuneSlider
            label="Ignore stray patches under" unit="sq ft" min={0} max={500} step={25} w={200}
            value={islandSqFt} onChange={onIslandSqFtChange} onChangeEnd={onApplyTuning}
          />
        ) : (
          <TuneSlider
            label="Sweep smoothing" unit="ft" min={2} max={20} step={1}
            value={closeFt} onChange={onCloseFtChange} onChangeEnd={onApplyTuning}
          />
        )}
      </Group>
    </>
  )
}
