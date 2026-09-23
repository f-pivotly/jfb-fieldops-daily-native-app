import { useCallback, useEffect, useRef, useState } from 'react'
import { executeDataView } from '../../data'

export function useReportList(projectId, pageSize) {
  const [state, setState] = useState({ key: null, rows: [], done: false, loading: true, error: null })
  const loadingMore = useRef(false)

  const key = projectId ? `${projectId}|${pageSize}` : null

  const fetchPage = useCallback(async (offset) => {
    const rows = await executeDataView('dvw-jfb-report-list-v2', {
      p_project_id: projectId,
      p_limit: pageSize + 1,
      p_offset: offset,
    })
    const list = Array.isArray(rows) ? rows : []
    return { page: list.slice(0, pageSize), done: list.length <= pageSize }
  }, [projectId, pageSize])

  useEffect(() => {
    if (!key) return undefined
    let alive = true
    fetchPage(0)
      .then(({ page, done }) => {
        if (alive) setState({ key, rows: page, done, loading: false, error: null })
      })
      .catch((err) => {
        if (alive) setState({ key, rows: [], done: true, loading: false, error: err.message })
      })
    return () => { alive = false }
  }, [key, fetchPage])

  const loadMore = useCallback(async () => {
    if (loadingMore.current || state.done || state.loading) return
    loadingMore.current = true
    try {
      const { page, done } = await fetchPage(state.rows.length)
      setState((s) => ({ ...s, rows: [...s.rows, ...page], done }))
    } catch (err) {
      setState((s) => ({ ...s, error: err.message, done: true }))
    } finally {
      loadingMore.current = false
    }
  }, [fetchPage, state.done, state.loading, state.rows.length])

  const current = state.key === key
  return {
    rows: current ? state.rows : [],
    done: current ? state.done : false,
    loading: current ? state.loading : true,
    error: current ? state.error : null,
    loadMore,
  }
}
