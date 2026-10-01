import { useEffect, useState } from 'react'
import { useAppConfig } from '../../contexts/appConfigContext'
import { fetchFirstRecord } from '../../data'

export function useLatestReading(domain, projectId, enabled) {
  const { config } = useAppConfig()
  const key = enabled && projectId ? `${domain}|${projectId}` : null
  const [state, setState] = useState({ key: null, row: null, error: null })
  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetchFirstRecord({ domain, appSlug: config.appSlug, filters: { project_id: projectId }, sortCol: 'reading_at', sortDir: 'desc' })
      .then((row) => { if (!cancelled) setState({ key, row, error: null }) })
      .catch((err) => { if (!cancelled) setState({ key, row: null, error: err.message }) })
    return () => { cancelled = true }
  }, [key, domain, projectId, config.appSlug])
  if (!key || state.key !== key) return { row: null, loading: !!key, error: null }
  return { row: state.row, loading: false, error: state.error }
}

export function useSavedFlash() {
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!savedAt) return
    const t = setTimeout(() => setSavedAt(null), 4000)
    return () => clearTimeout(t)
  }, [savedAt])
  return { savedAt, setSavedAt, error, setError }
}
