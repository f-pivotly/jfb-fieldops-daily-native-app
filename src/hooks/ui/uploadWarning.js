const FIELD_LABELS = {
  aerial_path: 'Aerial image',
  aerial_tiles: 'Aerial tiles',
  alignment_path: 'Alignment DXF',
  bg_path: 'Background image',
  boundary_path: 'Coverage boundary DXF',
  cells_path: 'Cells DXF',
  colorbar_path: 'Colorbar',
  design_extents_path: 'Design extents',
  earthworks_design_path: 'Earthworks design',
  grid_path: 'Bucket grid',
  isopach_tiles: 'Isopach tiles',
  plant_path: 'Plant outline',
  reference_lines_path: 'Alignment / stationing overlay',
  reference_surface_path: 'Reference survey',
}

function labelFor(field) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field]
  const words = String(field).replace(/_path$/, '').replace(/_/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : 'File'
}

export function uploadWarning(failedUploads, savedLabel = 'Settings saved') {
  const n = failedUploads.length
  return `${savedLabel}, but ${n} file${n > 1 ? 's' : ''} did not upload: `
    + failedUploads.map((f) => `${labelFor(f.field)} (${f.fileName}) — ${f.message}`).join('; ')
    + `. Everything else was saved; ${n > 1 ? 'those slots keep' : 'that slot keeps'} the previously stored file. `
    + `${n > 1 ? 'They are' : 'It is'} still selected, so you can fix the file and save again.`
}
