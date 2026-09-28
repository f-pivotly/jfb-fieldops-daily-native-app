import { useState } from 'react'
import { FETCH_PAGE_SIZE } from '../../constants/pagination'

export function usePagedRows(rows, pageSize = FETCH_PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, totalPages)
  return {
    pageRows: rows.slice((current - 1) * pageSize, current * pageSize),
    page: current,
    setPage,
    total: rows.length,
    pageSize,
  }
}
