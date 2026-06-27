import { useEffect, useRef } from 'preact/hooks'
import { escapeHtml } from '../../../utils'
import type { SourceHeaderProps } from '../../types'
import {
  loadFilters,
  getDefaultFilter,
  setDefaultFilter,
  deleteFilter,
  addFilter,
  updateFilter,
} from '../filters'
import { parseQuery } from '../query'
import type { XitData, XitLine, NamedFilterStore, NamedFilter } from '../types'
import { FilterForm, type FilterFormMode } from './filter-form'
import { EditIcon, DeleteIcon, SaveIcon } from '../../card/icons'

export type XitHeaderState = {
  lines: XitLine[]
  tagCounts: Map<string, number>
  query: string
  queryError: string | null
  filterStore: NamedFilterStore | null
  showFilters: boolean
  saveForm: FilterFormMode | null
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
    loadFilters(runtime).then((store) => {
      hs.filterStore = store
      const defaultFilter = getDefaultFilter(store)
      if (defaultFilter && !hs.query && searchRef.current) {
        hs.query = defaultFilter.query
        searchRef.current.value = defaultFilter.query
      }
      onHeaderChange()
    })
  }, [])

  function onSearchInput(value: string) {
    hs.query = value
    const result = parseQuery(value)
    hs.queryError = result.ok ? null : result.error
    onHeaderChange()
  }

  function onClear() {
    hs.query = ''
    hs.queryError = null
    if (searchRef.current) searchRef.current.value = ''
    searchRef.current?.focus()
    onHeaderChange()
  }

  function onSaveFilter(name: string, q: string) {
    if (!runtime || !name || !q) return
    addFilter(runtime, name, q).then(() => {
      hs.saveForm = null
      loadFilters(runtime).then((store) => {
        hs.filterStore = store
        onHeaderChange()
      })
    })
  }

  function onFilterStar(filterId: string) {
    if (!runtime) return
    setDefaultFilter(runtime, filterId).then(() => {
      loadFilters(runtime).then((store) => {
        hs.filterStore = store
        onHeaderChange()
      })
    })
  }

  function onFilterEdit(filter: NamedFilter, newName: string, newQuery: string) {
    if (!runtime || !newName || !newQuery) return
    updateFilter(runtime, filter.id, { name: newName, query: newQuery }).then(() => {
      hs.editFilter = null
      loadFilters(runtime).then((store) => {
        hs.filterStore = store
        onHeaderChange()
      })
    })
  }

  function onFilterDelete(filterId: string) {
    if (!runtime) return
    deleteFilter(runtime, filterId).then(() => {
      loadFilters(runtime).then((store) => {
        hs.filterStore = store
        onHeaderChange()
      })
    })
  }

  function onFilterClick(filter: NamedFilter) {
    hs.query = filter.query
    hs.queryError = null
    if (searchRef.current) searchRef.current.value = filter.query
    searchRef.current?.focus()
    onHeaderChange()
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
    onHeaderChange()
  }

  function handleBlur(e: FocusEvent) {
    const target = e.relatedTarget as Node | null
    if (!rootRef.current?.contains(target) && !rootRef.current?.parentElement?.contains(target)) {
      hs.showFilters = false
      hs.saveForm = null
      hs.editFilter = null
      onHeaderChange()
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
              onHeaderChange()
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
              hs.saveForm = { type: 'save', name: '', query: hs.query }
              onHeaderChange()
            }
          }}
        >
          <SaveIcon />
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
                          onHeaderChange()
                        }}
                      >
                        <EditIcon />
                      </span>
                      <span
                        class="gm-sp-xit-saved-filter-delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          onFilterDelete(f.id)
                        }}
                      >
                        <DeleteIcon />
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
            <FilterForm
              mode={hs.saveForm}
              onSave={(name, q) => onSaveFilter(name, q)}
              onCancel={() => {
                hs.saveForm = null
                onHeaderChange()
              }}
            />
          )}

          {hs.editFilter && (
            <FilterForm
              mode={{ type: 'edit', filter: hs.editFilter }}
              onSave={(name, q) => onFilterEdit(hs.editFilter!, name, q)}
              onCancel={() => {
                hs.editFilter = null
                onHeaderChange()
              }}
            />
          )}
        </div>
      )}
    </>
  )
}
