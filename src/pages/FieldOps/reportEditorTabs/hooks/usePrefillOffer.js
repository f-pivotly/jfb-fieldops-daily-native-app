import { useEffect, useState } from 'react'

// Shared "offer a prefill from a prior report, preview it, accept or
// dismiss" bookkeeping behind SafetyTab's "Use plan from M/D" and "Use crew
// from M/D" buttons. Only the fetch + preview-open + accept-busy state is
// generic here -- what accepting actually does, and exactly when the
// preview closes, stays with the caller, since that differs per field (one
// closes the preview immediately and saves in the background, another
// waits for every row to finish saving first).
export function usePrefillOffer({ enabled, fetchOffer, deps }) {
  const [offer, setOffer] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchOffer()
      .then((result) => { if (!cancelled) setOffer(result) })
      .catch(() => { if (!cancelled) setOffer(null) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  async function runAccept(fn) {
    setAccepting(true)
    try {
      await fn()
    } finally {
      setAccepting(false)
    }
  }

  return { offer, previewOpen, setPreviewOpen, accepting, runAccept }
}
