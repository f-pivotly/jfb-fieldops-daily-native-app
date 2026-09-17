function slug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function compactDate(dateISO) {
  return String(dateISO ?? '').slice(0, 10).replaceAll('-', '')
}

function projectPart(project) {
  const code = project?.project_code
  if (code != null && String(code).trim() !== '') return String(code).trim()
  return slug(project?.name) || 'project'
}

export function fileExtension(name) {
  const match = /\.([^.]+)$/.exec(name ?? '')
  return match ? match[1].toLowerCase() : 'bin'
}

export function dredgeFileName({ project, kind, dateISO, equipment, index, ext }) {
  const parts = [
    projectPart(project),
    slug(kind),
    compactDate(dateISO),
    slug(equipment?.name),
    index != null ? String(index) : '',
  ]
  return `${parts.filter(Boolean).join('_')}.${ext}`
}

export function renameFile(file, name) {
  return new File([file], name, { type: file.type, lastModified: file.lastModified })
}
