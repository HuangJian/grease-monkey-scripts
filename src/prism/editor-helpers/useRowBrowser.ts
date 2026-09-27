import { useCallback, useMemo, useState } from 'preact/hooks'
import { pageCount, pageOf } from './list-toolbar'

/**
 * Browsing state for a long list in an editor: query, page, selection,
 * expansion, and the unanswered bulk delete.
 *
 * Shared by every source editor that can hold dozens of entries, so the
 * behaviour — search resets the page, bulk actions act on the *filtered* rows,
 * an empty list still reads as page 1 — is identical everywhere instead of being
 * re-derived in each form.
 *
 * Selection and expansion are keyed by string, not by index: paging, filtering
 * and reordering all move indexes around, and a reader's selection must survive
 * them.
 */
export type RowBrowser<T> = {
  query: string
  setQuery: (value: string) => void
  /** The filtered items, in the list's own order. */
  visible: T[]
  /** The one page currently rendered. */
  rows: T[]
  page: number
  setPage: (page: number) => void
  pages: number
  selected: ReadonlySet<string>
  toggleSelected: (key: string) => void
  setSelected: (keys: ReadonlySet<string>) => void
  expanded: ReadonlySet<string>
  toggleExpanded: (key: string) => void
  /** Move the selection and expansion from one key to another after a rename. */
  renameKey: (from: string, to: string) => void
  /** Whether the bulk-delete confirmation is showing. */
  confirmRemove: boolean
  setConfirmRemove: (value: boolean) => void
}

export function useRowBrowser<T>(
  items: ReadonlyArray<T>,
  perPage: number,
  /** Does this item match the (already trimmed, lowercased) query? */
  matches: (item: T, needle: string) => boolean,
): RowBrowser<T> {
  const [query, setQueryRaw] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [confirmRemove, setConfirmRemove] = useState(false)

  const setQuery = useCallback((value: string) => {
    setQueryRaw(value)
    // A new search must be looked at from the top.
    setPage(0)
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return [...items]
    return items.filter((item) => matches(item, needle))
  }, [items, query, matches])

  const pages = pageCount(visible.length, perPage)
  const currentPage = Math.min(page, pages - 1)
  const rows = useMemo(() => pageOf(visible, currentPage, perPage), [visible, currentPage, perPage])

  const toggleSelected = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }, [])

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }, [])

  const renameKey = useCallback((from: string, to: string) => {
    setSelected((prev) => {
      if (!prev.has(from)) return prev
      const next = new Set(prev)
      next.delete(from)
      next.add(to)
      return next
    })
    setExpanded((prev) => {
      if (!prev.has(from)) return prev
      const next = new Set(prev)
      next.delete(from)
      next.add(to)
      return next
    })
  }, [])

  return {
    query,
    setQuery,
    visible,
    rows,
    page: currentPage,
    setPage,
    pages,
    selected,
    toggleSelected,
    setSelected,
    expanded,
    toggleExpanded,
    renameKey,
    confirmRemove,
    setConfirmRemove,
  }
}
