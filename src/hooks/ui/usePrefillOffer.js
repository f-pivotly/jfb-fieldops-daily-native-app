import { useEffect, useState } from 'react'

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
