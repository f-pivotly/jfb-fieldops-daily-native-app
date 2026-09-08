import { Button, FileButton, Group, NumberInput, Text, TextInput } from '@mantine/core'

export default function GenerateForm({
  requireStations,
  onFilesChange,
  fileCount,
  stationFrom, onStationFromChange,
  stationTo, onStationToChange,
  canGenerate, generating, onGenerate, progressMsg,
  showRecoveryInput,
  recoveryValue, onRecoveryChange,
  materialText, onMaterialTextChange,
  generated, isUpdate, saving, onSave,
  onDownloadDxf, onDownloadPng,
}) {
  return (
    <Group gap={10}>
      <FileButton onChange={onFilesChange} multiple>
        {(props) => <Button {...props} variant="default" size="xs">Choose Files</Button>}
      </FileButton>
      <Text size="xs" c="dimmed">
        {fileCount ? `${fileCount} file(s) selected` : 'No file chosen'}
      </Text>
      {requireStations && (
        <>
          <TextInput label="Start station" size="xs" w={130} placeholder="e.g. F43+50" value={stationFrom} onChange={(e) => onStationFromChange(e.currentTarget.value)} />
          <TextInput label="End station" size="xs" w={130} placeholder="e.g. F45+00" value={stationTo} onChange={(e) => onStationToChange(e.currentTarget.value)} />
        </>
      )}
      <Button size="xs" disabled={!canGenerate} loading={generating} onClick={onGenerate}>
        Generate chart
      </Button>
      {generating && progressMsg && (
        <Text size="xs" c="dimmed">{progressMsg}</Text>
      )}
      {showRecoveryInput && (
        <NumberInput
          label="Volume recovery factor"
          size="xs" w={140} min={0} max={1} step={0.01}
          value={recoveryValue === '' ? '' : Number(recoveryValue)}
          onChange={(v) => onRecoveryChange(v === '' || v == null ? '' : String(v))}
        />
      )}
      <TextInput
        label="Material encountered"
        size="xs" w={200}
        placeholder="e.g. Silts & Fine Sand"
        value={materialText}
        onChange={(e) => onMaterialTextChange(e.currentTarget.value)}
      />
      {generated && (
        <Button size="xs" variant="light" disabled={saving} loading={saving} onClick={onSave}>
          {isUpdate ? 'Update saved progress' : 'Save to report'}
        </Button>
      )}
      {generated && (
        <Button size="xs" variant="default" onClick={onDownloadDxf}>Download DXF</Button>
      )}
      {generated && (
        <Button size="xs" variant="default" onClick={onDownloadPng}>Download PNG</Button>
      )}
    </Group>
  )
}
