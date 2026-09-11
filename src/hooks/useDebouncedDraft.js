import { useEffect, useRef, useState } from 'react'

export function useDebouncedDraft({ row, onSave, debounceMs }) {
  const [draft, setDraft] = useState(row?.content ?? '')
  const [saveState, setSaveState] = useState('idle')
  const [syncedRowId, setSyncedRowId] = useState(row?.id)
  const timerRef = useRef(null)
  const draftRef = useRef(draft)
  const onSaveRef = useRef(onSave)

  useEffect(() => {
    draftRef.current = draft
  })
  useEffect(() => {
    onSaveRef.current = onSave
  })

  if (row?.id !== syncedRowId && saveState !== 'pending' && saveState !== 'saving') {
    setSyncedRowId(row?.id)
    setDraft(row?.content ?? '')
  }

  const flushSave = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if ((row?.content ?? '') === draftRef.current) return
    setSaveState('saving')
    try {
      await onSaveRef.current(draftRef.current)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }
  const flushSaveRef = useRef(flushSave)
  useEffect(() => {
    flushSaveRef.current = flushSave
  })

  useEffect(
    () => () => {
      void flushSaveRef.current()
    },
    [],
  )

  function handleChange(next) {
    setDraft(next)
    setSaveState('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void flushSaveRef.current()
    }, debounceMs)
  }

  return { draft, saveState, handleChange, flushSave }
}
