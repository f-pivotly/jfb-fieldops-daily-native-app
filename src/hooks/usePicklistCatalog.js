import { useEffect, useState, useRef } from 'react'
import { loadPicklist } from './usePicklist'

export function usePicklistCatalog(slugs) {
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState([])
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    if (!cancelledRef.current) setLoading(true)

    Promise.allSettled(slugs.map((slug) => loadPicklist(slug))).then((results) => {
      if (cancelledRef.current) return
      const failed = results
        .map((result, i) => (result.status === 'rejected' ? slugs[i] : null))
        .filter(Boolean)
      setMissing(failed)
      setLoading(false)
    })

    return () => { cancelledRef.current = true }
  }, [slugs])

  return { loading, missing, ready: !loading && missing.length === 0 }
}
