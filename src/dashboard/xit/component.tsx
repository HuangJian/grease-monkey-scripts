import { useEffect, useRef } from 'preact/hooks'
import { escapeHtml } from '../../utils'
import type { SourceComponentProps, SourceHeaderProps } from '../types'
import { showEditorDialog } from '../shell/editor'
import { createXitEditor, setPendingLineIndex } from './editor'
import {
  loadFilters,
  getDefaultFilter,
  setDefaultFilter,
  deleteFilter,
  addFilter,
  updateFilter,
} from './filters'
import { parseQuery, filterItems } from './query'
import { getDueDateStatus } from './render/due-date'
import { linesToHtml } from './render/list-render'
import type { XitData, XitLine, XitItem, NamedFilterStore, NamedFilter } from './types'

export type XitHeaderState = {
  lines: XitLine[]
  tagCounts: Map<string, number>
  query: string
  queryError: string | null
  filterStore: NamedFilterStore | null
  showFilters: boolean
  saveForm: { name: string; q: string } | null
  editFilter: NamedFilter | null
}

export function XitHeaderControls({
  data: _data,
  runtime,
  headerState,
  onHeaderChange,
  onEdit: _onEdit,
}: SourceHeaderProps<XitData> & {
  headerState: XitHeaderState
  onHeaderChange?: () => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const hs = headerState

  useEffect(() => {
    if (runtime) {
      loadFilters(runtime).then((store) => {
        hs.filterStore = store
        const defaultFilter = getDefaultFilter(store)
        if (defaultFilter && !hs.query && searchRef.current) {
          hs.query = defaultFilter.query
          searchRef.current.value = defaultFilter.query
        }
        onHeaderChange?.()
      })
    }
  }, [])

  function onSearchInput(value: string) {
    hs.query = value
    const result = parseQuery(value)
    hs.queryError = result.ok ? null : result.error
    onHeaderChange?.()
  }

  function onClear() {
    hs.query = ''
    hs.queryError = null
    if (searchRef.current) searchRef.current.value = ''
    searchRef.current?.focus()
    onHeaderChange?.()
  }

  function onSaveFilter(name: string, q: string) {
    if (!runtime || !name || !q) return
    addFilter(runtime, name, q).then(() => {
      hs.saveForm = null
      loadFilters(runtime).then((store) => {
        hs.filterStore = store
        onHeaderChange?.()
      })
    })
  }

  function onFilterStar(filterId: string) {
    if (!runtime) return
    setDefaultFilter(runtime, filterId).then(() => {
      loadFilters(runtime).then((store) => {
        hs.filterStore = store
        onHeaderChange?.()
      })
    })
  }

  function onFilterEdit(filter: NamedFilter, newName: string, newQuery: string) {
    if (!runtime || !newName || !newQuery) return
    updateFilter(runtime, filter.id, { name: newName, query: newQuery }).then(() => {
      hs.editFilter = null
      loadFilters(runtime).then((store) => {
        hs.filterStore = store
        onHeaderChange?.()
      })
    })
  }

  function onFilterDelete(filterId: string) {
    if (!runtime) return
    deleteFilter(runtime, filterId).then(() => {
      loadFilters(runtime).then((store) => {
        hs.filterStore = store
        onHeaderChange?.()
      })
    })
  }

  function onFilterClick(filter: NamedFilter) {
    hs.query = filter.query
    hs.queryError = null
    if (searchRef.current) searchRef.current.value = filter.query
    searchRef.current?.focus()
    onHeaderChange?.()
  }

  function onTagClick(tag: string) {
    const tagQuery = `#${tag}`
    let newQuery: string
    if (hs.query.includes(tagQuery)) {
      newQuery = hs.query.replace(tagQuery, '').replace(/\s+/g, ' ').trim()
    } else {
      newQuery = hs.query ? `${hs.query} ${tagQuery}` : tagQuery
    }
    hs.query = newQuery
    if (searchRef.current) searchRef.current.value = newQuery
    const result = parseQuery(newQuery)
    hs.queryError = result.ok ? null : result.error
    onHeaderChange?.()
  }

  function handleBlur(e: FocusEvent) {
    const target = e.relatedTarget as Node | null
    if (!rootRef.current?.contains(target) && !rootRef.current?.parentElement?.contains(target)) {
      hs.showFilters = false
      hs.saveForm = null
      hs.editFilter = null
      onHeaderChange?.()
    }
  }

  const filterName = hs.filterStore?.filters.find((f) => f.query === hs.query)?.name ?? null
  const displaySavedFilters = hs.filterStore?.filters ?? []
  const sortedTags = Array.from(hs.tagCounts.entries()).sort((a, b) => b[1] - a[1])

  return (
    <>
      <div class="gm-sp-xit-header-row" ref={rootRef}>
        {filterName && (
          <span class="gm-sp-xit-filter-name" onClick={() => searchRef.current?.focus()}>
            {filterName}
          </span>
        )}
        <span class="gm-sp-xit-input-wrap">
          <input
            ref={searchRef}
            type="text"
            class={`gm-sp-input gm-sp-xit-header-search${filterName ? ' gm-sp-xit-header-search-with-name' : ''}${hs.queryError ? ' gm-sp-xit-query-error' : ''}`}
            placeholder="🔍 查询: [ ] !>2 #urgent today"
            defaultValue={hs.query}
            onInput={(e) => onSearchInput((e.target as HTMLInputElement).value)}
            onFocus={() => {
              hs.showFilters = true
              onHeaderChange?.()
            }}
            onBlur={handleBlur}
          />
          {hs.query && (
            <button type="button" class="gm-sp-xit-clear-btn" aria-label="clear" onClick={onClear}>
              ×
            </button>
          )}
        </span>
        <button
          type="button"
          class="gm-sp-btn gm-sp-btn-icon gm-sp-edit"
          aria-label="save filter"
          onClick={() => {
            if (hs.query) {
              hs.saveForm = { name: '', q: hs.query }
              onHeaderChange?.()
            }
          }}
        >
          +
        </button>
      </div>

      {hs.showFilters && (
        <div
          class="gm-sp-xit-header-row gm-sp-xit-header-filters"
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault()
          }}
        >
          {displaySavedFilters.length > 0 && (
            <div class="gm-sp-xit-saved-filters">
              {displaySavedFilters.map((f) => {
                const isActive = hs.query === f.query
                const starClass = f.isDefault ? ' gm-sp-xit-saved-filter-star-default' : ''
                const starChar = f.isDefault ? '\u2605' : '\u2606'
                return (
                  <button
                    type="button"
                    class={`gm-sp-xit-saved-filter${isActive ? ' gm-sp-xit-saved-filter-active' : ''}`}
                    data-filter-id={f.id}
                    onClick={() => onFilterClick(f)}
                  >
                    <span class="gm-sp-xit-saved-filter-name">{escapeHtml(f.name)}</span>
                    <span class="gm-sp-xit-saved-filter-actions">
                      <span
                        class={`gm-sp-xit-saved-filter-star${starClass}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onFilterStar(f.id)
                        }}
                      >
                        {starChar}
                      </span>
                      <span
                        class="gm-sp-xit-saved-filter-edit"
                        onClick={(e) => {
                          e.stopPropagation()
                          hs.editFilter = f
                          onHeaderChange?.()
                        }}
                      >
                        ✏
                      </span>
                      <span
                        class="gm-sp-xit-saved-filter-delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          onFilterDelete(f.id)
                        }}
                      >
                        ×
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {sortedTags.length > 0 && (
            <div class="gm-sp-xit-tags">
              {sortedTags.map(([name, count]) => {
                const isActive = hs.query.includes(`#${name}`)
                return (
                  <button
                    type="button"
                    class={`gm-sp-xit-tag-chip${isActive ? ' gm-sp-xit-tag-chip-active' : ''}`}
                    data-tag={name}
                    onClick={() => onTagClick(name)}
                  >
                    #{escapeHtml(name)} <span class="gm-sp-xit-tag-chip-count">{count}</span>
                  </button>
                )
              })}
            </div>
          )}

          {hs.saveForm && (
            <SaveForm
              name={hs.saveForm.name}
              query={hs.saveForm.q}
              onSave={(name, q) => onSaveFilter(name, q)}
              onCancel={() => {
                hs.saveForm = null
                onHeaderChange?.()
              }}
            />
          )}

          {hs.editFilter && (
            <EditForm
              filter={hs.editFilter}
              onSave={(name, q) => onFilterEdit(hs.editFilter!, name, q)}
              onCancel={() => {
                hs.editFilter = null
                onHeaderChange?.()
              }}
            />
          )}
        </div>
      )}
    </>
  )
}

export function XitBody({
  data: _data,
  root,
  runtime,
  headerState,
}: SourceComponentProps<XitData> & { headerState: XitHeaderState }) {
  const hs = headerState
  const lines = hs.lines
  const query = hs.query
  const queryError = hs.queryError

  const isFiltering = query !== ''
  let displayLines: XitLine[] = []

  if (isFiltering) {
    const result = parseQuery(query)
    if (result.ok) {
      displayLines = filterItems(lines, result.ast)
      const enrichedLines: XitLine[] = []
      let lastHeading: XitLine | null = null
      for (const line of lines) {
        if (line.type === 'heading') {
          lastHeading = line
        } else if (displayLines.includes(line)) {
          if (lastHeading && !enrichedLines.includes(lastHeading)) {
            enrichedLines.push(lastHeading)
          }
          enrichedLines.push(line)
          lastHeading = null
        }
      }
      displayLines = enrichedLines

      const todayItems = displayLines.filter(
        (l): l is XitItem => l.type === 'item' && getDueDateStatus(l.dueDate ?? '') === 'today',
      )
      if (todayItems.length > 0) {
        todayItems.sort((a, b) => b.priority - a.priority)
        displayLines = [...todayItems, ...displayLines]
      }
    } else {
      displayLines = lines.filter((l) => l.type !== 'blank')
    }
  } else {
    displayLines = lines
  }

  function openEditor(lineIndex?: number) {
    if (root && runtime) {
      setPendingLineIndex(lineIndex ?? null)
      showEditorDialog(
        document,
        root,
        '<a href="https://xit.jotaen.net/" target="_blank" rel="noopener">[x]it! 语法规范</a>',
        runtime,
        async (dialogBody, dialogClose) => {
          const editor = createXitEditor()
          return editor(dialogBody, {
            runtime,
            onRevert: () => {},
            close: dialogClose,
          })
        },
      )
    }
  }

  return (
    <div class="gm-sp-xit">
      {queryError && <div class="gm-sp-xit-query-error-box gm-sp-error-box">{queryError}</div>}
      <div class="gm-sp-xit-list">
        {displayLines.length === 0 ? (
          <div class="gm-sp-xit-empty">无符合条件的条目</div>
        ) : (
          <ListContent lines={displayLines} openEditor={openEditor} />
        )}
      </div>
    </div>
  )
}

function ListContent({
  lines,
  openEditor,
}: {
  lines: XitLine[]
  openEditor?: (lineIndex?: number) => void
}) {
  function handleDblClick(e: MouseEvent) {
    const item = (e.target as HTMLElement).closest('.gm-sp-xit-item') as HTMLElement | null
    if (item) {
      const idx = Number(item.dataset['lineIndex'])
      if (!Number.isNaN(idx)) openEditor?.(idx)
    }
  }

  return (
    <div
      class="gm-sp-xit-list"
      onDblClick={handleDblClick}
      dangerouslySetInnerHTML={{ __html: linesToHtml(lines) }}
    />
  )
}

function SaveForm({
  name,
  query: initialQuery,
  onSave,
  onCancel,
}: {
  name: string
  query: string
  onSave: (name: string, query: string) => void
  onCancel: () => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  function handleConfirm() {
    const n = nameRef.current?.value.trim() ?? ''
    const q = queryRef.current?.value.trim() ?? ''
    if (n && q) onSave(n, q)
  }

  return (
    <div class="gm-sp-xit-save-form">
      <input
        ref={nameRef}
        type="text"
        class="gm-sp-input gm-sp-xit-save-name"
        placeholder="Name"
        defaultValue={name}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConfirm()
          if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
      />
      <input
        ref={queryRef}
        type="text"
        class="gm-sp-input gm-sp-xit-save-query"
        placeholder="Query"
        defaultValue={initialQuery}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConfirm()
          if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
      />
      <button type="button" class="gm-sp-btn gm-sp-xit-save-confirm" onClick={handleConfirm}>
        Save
      </button>
      <button type="button" class="gm-sp-btn gm-sp-xit-save-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

function EditForm({
  filter,
  onSave,
  onCancel,
}: {
  filter: NamedFilter
  onSave: (name: string, query: string) => void
  onCancel: () => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  function handleConfirm() {
    const n = nameRef.current?.value.trim() ?? ''
    const q = queryRef.current?.value.trim() ?? ''
    if (n && q) onSave(n, q)
  }

  return (
    <div class="gm-sp-xit-save-form">
      <input
        ref={nameRef}
        type="text"
        class="gm-sp-input gm-sp-xit-save-name"
        placeholder="Name"
        defaultValue={filter.name}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConfirm()
          if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
      />
      <input
        ref={queryRef}
        type="text"
        class="gm-sp-input gm-sp-xit-save-query"
        placeholder="Query"
        defaultValue={filter.query}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConfirm()
          if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
      />
      <button type="button" class="gm-sp-btn gm-sp-xit-save-confirm" onClick={handleConfirm}>
        Save
      </button>
      <button type="button" class="gm-sp-btn gm-sp-xit-save-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
