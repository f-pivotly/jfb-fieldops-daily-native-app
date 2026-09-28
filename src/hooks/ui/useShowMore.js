import { useState } from 'react'
import { FETCH_PAGE_SIZE } from '../../constants/pagination'

export function useShowMore(rows, step = FETCH_PAGE_SIZE) {
  const [count, setCount] = useState(step)
  return {
    visible: rows.slice(0, count),
    hasMore: rows.length > count,
    showMore: () => setCount((c) => c + step),
  }
}
