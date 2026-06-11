import { useEffect, useRef, useState } from 'preact/hooks'
import { escapeHtml } from '../../utils'
import type { SourceComponentProps } from '../types'
import { showEditorDialog } from '../overlay/editor'
import { createXitEditor, setPendingLineIndex } from './editor'
import {
  loadFilters,
  getDefaultFilter,
  setDefaultFilter,
  deleteFilter,
  addFilter,
  updateFilter,
} from './filters'
import { parseXitText } from './parser'
import { parseQuery, filterItems } from './query'
import { getDueDateStatus } from './render/due-date'
import { linesToHtml } from './render/list-render'
import type { XitData, XitLine, XitItem, NamedFilterStore, NamedFilter } from './types'

export function XitComponent({ data, root, runtime }: SourceComponentProps<XitData>) {
  const text = data?.text ?? ''
  const lines = parseXitText(text)
  const tagCounts = getTagCounts(lines)

  const [query, setQuery] = useState('')
  const [queryError, setQueryError] = useState<string | null>(null)
  const [filterStore, setFilterStore] = useState<NamedFilterStore | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [saveForm, setSaveForm] = useState<{ name: string; q: string } | null>(null)
  const [editFilter, setEditFilter] = useState<NamedFilter | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (runtime) {
      loadFilters(runtime).then((store) => {
        setFilterStore(store)
        const defaultFilter = getDefaultFilter(store)
        if (defaultFilter && !query && searchRef.current) {
          setQuery(defaultFilter.query)
          searchRef.current.value = defaultFilter.query
        }
      })
    }
  }, [])

  useEffect(() => {
    if (!saveForm && !editFilter && searchRef.current) {
      searchRef.current.focus()
    }
  }, [saveForm, editFilter])

  function onSearchInput(value: string) {
    setQuery(value)
    const result = parseQuery(value)
    setQueryError(result.ok ? null : result.error)
  }

  function onClear() {
    setQuery('')
    setQueryError(null)
    if (searchRef.current) searchRef.current.value = ''
    searchRef.current?.focus()
  }

  function onSaveFilter(name: string, q: string) {
    if (!runtime || !name || !q) return
    addFilter(runtime, name, q).then(() => {
      setSaveForm(null)
      loadFilters(runtime).then(setFilterStore)
    })
  }

  function onFilterStar(filterId: string) {
    if (!runtime) return
    setDefaultFilter(runtime, filterId).then(() => {
      loadFilters(runtime).then(setFilterStore)
    })
  }

  function onFilterEdit(filter: NamedFilter, newName: string, newQuery: string) {
    if (!runtime || !newName || !newQuery) return
    updateFilter(runtime, filter.id, { name: newName, query: newQuery }).then(() => {
      setEditFilter(null)
      loadFilters(runtime).then(setFilterStore)
    })
  }

  function onFilterDelete(filterId: string) {
    if (!runtime) return
    deleteFilter(runtime, filterId).then(() => {
      loadFilters(runtime).then(setFilterStore)
    })
  }

  function onFilterClick(filter: NamedFilter) {
    setQuery(filter.query)
    setQueryError(null)
    if (searchRef.current) searchRef.current.value = filter.query
    searchRef.current?.focus()
  }

  function onTagClick(tag: string) {
    const tagQuery = `#${tag}`
    let newQuery: string
    if (query.includes(tagQuery)) {
      newQuery = query.replace(tagQuery, '').replace(/\s+/g, ' ').trim()
    } else {
      newQuery = query ? `${query} ${tagQuery}` : tagQuery
    }
    setQuery(newQuery)
    if (searchRef.current) searchRef.current.value = newQuery
    const result = parseQuery(newQuery)
    setQueryError(result.ok ? null : result.error)
  }

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

  function handleBlur(e: FocusEvent) {
    if (!rootRef.current?.contains(e.relatedTarget as Node)) {
      setShowFilters(false)
      setSaveForm(null)
      setEditFilter(null)
    }
  }

  const filterName = filterStore?.filters.find((f) => f.query === query)?.name ?? null

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

  const displaySavedFilters = filterStore?.filters ?? []

  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1])

  return (
    <div class="gm-sp-xit" ref={rootRef}>
      <div class="gm-sp-xit-header-row">
        {filterName && (
          <span class="gm-sp-xit-filter-name" onClick={() => searchRef.current?.focus()}>
            {filterName}
          </span>
        )}
        <input
          ref={searchRef}
          type="text"
          class={`gm-sp-input gm-sp-xit-header-search${filterName ? ' gm-sp-xit-header-search-with-name' : ''}${queryError ? ' gm-sp-xit-query-error' : ''}`}
          placeholder="🔍 查询: [ ] !>2 #urgent today"
          defaultValue={query}
          onInput={(e) => onSearchInput((e.target as HTMLInputElement).value)}
          onFocus={() => setShowFilters(true)}
          onBlur={handleBlur}
        />
        <button
          type="button"
          class="gm-sp-btn gm-sp-btn-icon gm-sp-edit"
          aria-label="clear"
          onClick={onClear}
        >
          ×
        </button>
        <button
          type="button"
          class="gm-sp-btn gm-sp-btn-icon gm-sp-edit"
          aria-label="save filter"
          onClick={() => {
            if (query) setSaveForm({ name: '', q: query })
          }}
        >
          +
        </button>
      </div>

      {showFilters && (
        <div
          class="gm-sp-xit-header-filters"
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault()
          }}
        >
          {displaySavedFilters.length > 0 && (
            <div class="gm-sp-xit-saved-filters">
              {displaySavedFilters.map((f) => {
                const isActive = query === f.query
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
                          setEditFilter(f)
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
                const isActive = query.includes(`#${name}`)
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

          {saveForm && (
            <SaveForm
              name={saveForm.name}
              query={saveForm.q}
              onSave={(name, q) => onSaveFilter(name, q)}
              onCancel={() => setSaveForm(null)}
            />
          )}

          {editFilter && (
            <EditForm
              filter={editFilter}
              onSave={(name, q) => onFilterEdit(editFilter, name, q)}
              onCancel={() => setEditFilter(null)}
            />
          )}
        </div>
      )}

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
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.querySelectorAll<HTMLElement>('.gm-sp-xit-item').forEach((itemEl) => {
      itemEl.addEventListener('dblclick', () => {
        const idx = Number(itemEl.dataset['lineIndex'])
        if (!Number.isNaN(idx) && openEditor) {
          openEditor(idx)
        }
      })
    })
  })

  return <div ref={listRef} dangerouslySetInnerHTML={{ __html: linesToHtml(lines) }} />
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

function getTagCounts(lines: XitLine[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const line of lines) {
    if (line.type === 'item') {
      for (const tag of line.tags) {
        counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1)
      }
    }
  }
  return counts
}
