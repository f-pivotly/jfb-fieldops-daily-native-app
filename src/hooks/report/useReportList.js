import { useEffect, useState } from 'react'
import { executeDataView } from '../../data'

export function useReportList(projectId, pageSize) {
  const [state, setState] = useState({ key: null, rows: [], hasNext: false, loading: true, error: null })
  const [pageState, setPageState] = useState({ projectId, page: 1 })
  const page = pageState.projectId === projectId ? pageState.page : 1
  const setPage = (next) => setPageState({ projectId, page: next })

  const key = projectId ? `${projectId}|${pageSize}|${page}` : null

  useEffect(() => {
    if (!key) return undefined
    let alive = true
    executeDataView('dvw-jfb-report-list-v2', {
      p_project_id: projectId,
      p_limit: pageSize + 1,
      p_offset: (page - 1) * pageSize,
    })
      .then((rows) => {
        if (!alive) return
        const list = Array.isArray(rows) ? rows : []
        setState({ key, rows: list.slice(0, pageSize), hasNext: list.length > pageSize, loading: false, error: null })
      })
      .catch((err) => {
        if (alive) setState({ key, rows: [], hasNext: false, loading: false, error: err.message })
      })
    return () => { alive = false }
  }, [key, projectId, pageSize, page])

  const current = state.key === key
  return {
    rows: current ? state.rows : [],
    hasNext: current ? state.hasNext : false,
    loading: current ? state.loading : true,
    error: current ? state.error : null,
    page,
    setPage,
  }
}
