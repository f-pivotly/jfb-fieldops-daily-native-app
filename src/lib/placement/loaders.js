import { downloadAttachment } from '../../data'
import { parseReferenceLines } from '../dredge/chart'
import { prepareGrid, validatePlacementGrid } from './grid'

export async function loadPlacementGrid(fileId, gridRef) {
  if (!fileId) return null
  if (gridRef.current?.path === fileId) return gridRef.current.grid
  const blob = await downloadAttachment(fileId)
  const grid = prepareGrid(validatePlacementGrid(JSON.parse(await blob.text())))
  gridRef.current = { path: fileId, grid }
  return grid
}

const EMPTY_LINES = { segments: [], labels: [], emphasis: [] }

function normaliseReferenceLines(raw) {
  return {
    segments: raw?.segments ?? [],
    labels: raw?.labels ?? [],
    emphasis: raw?.emphasis ?? [],
  }
}

export async function loadPlacementReferenceLines(fileId, linesRef) {
  if (!fileId) return EMPTY_LINES
  if (linesRef.current?.path === fileId) return linesRef.current.lines
  let lines
  try {
    const text = await (await downloadAttachment(fileId)).text()
    const trimmed = text.trimStart()
    lines = normaliseReferenceLines(
      trimmed.startsWith('{') ? JSON.parse(text) : parseReferenceLines(text),
    )
  } catch {
    lines = EMPTY_LINES
  }
  linesRef.current = { path: fileId, lines }
  return lines
}

export async function loadDesignExtents(fileId, extRef) {
  if (!fileId) return null
  if (extRef?.current?.path === fileId) return extRef.current.extents
  let extents
  try {
    const j = JSON.parse(await (await downloadAttachment(fileId)).text())
    extents = j?.rings?.length ? { rings: j.rings, sqFt: j.sqFt } : null
  } catch {
    extents = null
  }
  if (extRef) extRef.current = { path: fileId, extents }
  return extents
}

export async function loadPlant(fileId, plantRef) {
  if (!fileId) return null
  if (plantRef?.current?.path === fileId) return plantRef.current.plant
  let plant
  try {
    plant = JSON.parse(await (await downloadAttachment(fileId)).text())
  } catch {
    plant = null
  }
  if (plantRef) plantRef.current = { path: fileId, plant }
  return plant
}
