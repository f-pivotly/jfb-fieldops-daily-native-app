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

export async function loadPlacementReferenceLines(fileId, linesRef) {
  const empty = { segments: [], labels: [] }
  if (!fileId) return empty
  if (linesRef.current?.path === fileId) return linesRef.current.lines
  let lines
  try {
    lines = parseReferenceLines(await (await downloadAttachment(fileId)).text())
  } catch {
    lines = empty
  }
  linesRef.current = { path: fileId, lines }
  return lines
}
