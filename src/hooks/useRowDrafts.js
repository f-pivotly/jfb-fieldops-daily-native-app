import { useState } from 'react'

function keyOf(rowKey, field) {
  return `${rowKey}:${field}`
}

// Shared "local draft, flush on blur" idiom -- stores only uncommitted
// per-(row, field) edits, keyed by "rowKey:field", the same shape
// ProductionStatsTab's comboEdits/comboCellValue and PipeConfigPanel's
// edits/cellValue each hand-roll independently. Persistence stays bespoke
// per call site (different domain hooks/payload shapes) -- this only tracks
// what's pending and lets the caller read/clear one field at a time, since a
// row can have several fields mid-edit independently (blurring one must not
// drop drafts still pending on another).
export function useRowDrafts() {
  const [drafts, setDrafts] = useState({})

  function setField(rowKey, field, value) {
    setDrafts((prev) => ({ ...prev, [keyOf(rowKey, field)]: value }))
  }

  function valueFor(rowKey, field, fallback) {
    const key = keyOf(rowKey, field)
    return key in drafts ? drafts[key] : fallback
  }

  function hasDraft(rowKey, field) {
    return keyOf(rowKey, field) in drafts
  }

  function clear(rowKey, field) {
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[keyOf(rowKey, field)]
      return next
    })
  }

  return { setField, valueFor, hasDraft, clear }
}
