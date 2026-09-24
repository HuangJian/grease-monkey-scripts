import type { ComponentChildren } from 'preact'

export type ToolbarOption<T extends string> = { value: T; label: string }

/** The rows of one page, given the filtered set and a page index. */
export function pageOf<T>(rows: ReadonlyArray<T>, page: number, perPage: number): T[] {
  const start = page * perPage
  return rows.slice(start, start + perPage)
}

/** Total pages, never less than 1 — an empty list still has a "page 1". */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage))
}

export type EditorListToolbarProps<T extends string> = {
  query: string
  onQuery: (value: string) => void
  queryPlaceholder?: string
  status: T
  onStatus: (value: T) => void
  statusOptions: ReadonlyArray<ToolbarOption<T>>
  /** "共 100 · 命中 12" — the reader needs to know the filter is on. */
  counter: string
  page?: number
  pageCount?: number
  onPage?: ((page: number) => void) | undefined
  /** Bulk selection is optional: only the long lists offer it. */
  selection?: {
    selectedCount: number
    allSelected: boolean
    onSelectAll: (selected: boolean) => void
    actions: ReadonlyArray<{ label: string; action: string; onClick: () => void }>
  }
  children?: ComponentChildren
}

/**
 * The controls above a long editor list: search, status filter, live counter,
 * bulk actions and pagination.
 *
 * Sticky (see `.gm-sp-editor-toolbar`) so the reader can refine the query
 * without scrolling back to the top of a hundred rows. It owns no state — each
 * form keeps the query and the selection, because the rows it filters live there.
 */
export function EditorListToolbar<T extends string>({
  query,
  onQuery,
  queryPlaceholder = '搜索',
  status,
  onStatus,
  statusOptions,
  counter,
  page,
  // Renamed on the way in: the shared `pageCount()` helper computes this value.
  pageCount: totalPages,
  onPage,
  selection,
  children,
}: EditorListToolbarProps<T>) {
  return (
    <div class="gm-sp-editor-toolbar">
      <input
        type="search"
        class="gm-sp-input gm-sp-toolbar-search"
        data-action="toolbar-search"
        placeholder={queryPlaceholder}
        value={query}
        onInput={(e) => onQuery((e.target as HTMLInputElement).value)}
      />
      <select
        class="gm-sp-input gm-sp-toolbar-status"
        data-action="toolbar-status"
        value={status}
        onChange={(e) => onStatus((e.target as HTMLSelectElement).value as T)}
      >
        {statusOptions.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span class="gm-sp-toolbar-counter" data-action="toolbar-counter">
        {counter}
      </span>
      {selection ? (
        <>
          <label class="gm-sp-toolbar-selectall">
            <input
              type="checkbox"
              data-action="toolbar-select-all"
              checked={selection.allSelected}
              onChange={(e) => selection.onSelectAll((e.target as HTMLInputElement).checked)}
            />
            <span>全选</span>
          </label>
          {selection.selectedCount > 0 ? (
            <>
              <span class="gm-sp-toolbar-selected" data-action="toolbar-selected">
                {`已选 ${selection.selectedCount}`}
              </span>
              {selection.actions.map((action) => (
                <button
                  type="button"
                  class="gm-sp-editor-btn gm-sp-btn"
                  data-action={action.action}
                  key={action.action}
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ))}
            </>
          ) : null}
        </>
      ) : null}
      {page !== undefined && totalPages !== undefined && onPage ? (
        <span class="gm-sp-toolbar-pages">
          <button
            type="button"
            class="gm-sp-editor-btn gm-sp-btn gm-sp-page-btn"
            data-action="page-prev"
            disabled={page <= 0}
            onClick={() => onPage(page - 1)}
          >
            上一页
          </button>
          <span data-action="page-label">{`${page + 1} / ${totalPages}`}</span>
          <button
            type="button"
            class="gm-sp-editor-btn gm-sp-btn gm-sp-page-btn"
            data-action="page-next"
            disabled={page >= totalPages - 1}
            onClick={() => onPage(page + 1)}
          >
            下一页
          </button>
        </span>
      ) : null}
      {children}
    </div>
  )
}
