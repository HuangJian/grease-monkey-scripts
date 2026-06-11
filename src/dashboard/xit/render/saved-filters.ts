import { escapeHtml } from '../../../utils'
import { loadFilters, setDefaultFilter, deleteFilter } from '../filters'
import type { XitLine, NamedFilterStore } from '../types'
import { getQueryState } from './query-state'
import { renderListAndTags } from './list-render'
import { showEditForm, type XitRenderOptions } from './edit-form'

function updateFilterNameDisplay(
  card: HTMLElement,
  store: NamedFilterStore,
  currentQuery: string,
): void {
  const nameSpan = card.querySelector('.gm-sp-xit-filter-name') as HTMLElement
  const searchInput = card.querySelector('.gm-sp-xit-header-search') as HTMLInputElement
  if (!nameSpan || !searchInput) return

  const match = store.filters.find((f) => f.query === currentQuery)
  if (match) {
    nameSpan.textContent = match.name
    nameSpan.classList.remove('hidden')
    searchInput.classList.add('gm-sp-xit-header-search-with-name')
  } else {
    nameSpan.classList.add('hidden')
    searchInput.classList.remove('gm-sp-xit-header-search-with-name')
  }
}

export function renderSavedFilters(
  card: HTMLElement,
  wrapper: HTMLElement,
  lines: XitLine[],
  options: XitRenderOptions,
): void {
  const savedFiltersEl = card.querySelector('.gm-sp-xit-saved-filters') as HTMLElement | null
  const searchInput = card.querySelector('.gm-sp-xit-header-search') as HTMLInputElement | null
  const tagsEl = card.querySelector('.gm-sp-xit-tags') as HTMLElement | null
  const errorEl = card.querySelector('.gm-sp-error') as HTMLElement | null
  if (!savedFiltersEl || !options.runtime) return

  loadFilters(options.runtime).then((store) => {
    const state = getQueryState(wrapper)
    updateFilterNameDisplay(card, store, state.query)

    if (store.filters.length === 0) {
      savedFiltersEl.innerHTML = ''
      return
    }

    const chipsHtml = store.filters
      .map((f) => {
        const isActive = state.query === f.query
        const activeClass = isActive ? ' gm-sp-xit-saved-filter-active' : ''
        const starClass = f.isDefault ? ' gm-sp-xit-saved-filter-star-default' : ''
        const starChar = f.isDefault ? '\u2605' : '\u2606'
        return `<button type="button" class="gm-sp-xit-saved-filter${activeClass}" data-filter-id="${escapeHtml(f.id)}">
          <span class="gm-sp-xit-saved-filter-name">${escapeHtml(f.name)}</span>
          <span class="gm-sp-xit-saved-filter-actions">
            <span class="gm-sp-xit-saved-filter-star${starClass}" data-action="star">${starChar}</span>
            <span class="gm-sp-xit-saved-filter-edit" data-action="edit">\u270f</span>
            <span class="gm-sp-xit-saved-filter-delete" data-action="delete">\u00d7</span>
          </span>
        </button>`
      })
      .join('')

    savedFiltersEl.innerHTML = chipsHtml

    savedFiltersEl
      .querySelectorAll<HTMLButtonElement>('.gm-sp-xit-saved-filter')
      .forEach((chip) => {
        const filterId = chip.dataset['filterId'] ?? ''

        chip.addEventListener('click', (e) => {
          const target = e.target as HTMLElement
          if (target.closest('[data-action]')) return

          const filter = store.filters.find((f) => f.id === filterId)
          if (!filter || !searchInput) return

          searchInput.value = filter.query
          state.query = filter.query
          state.error = null
          searchInput.classList.remove('gm-sp-xit-query-error')
          if (errorEl) {
            errorEl.textContent = ''
            errorEl.classList.add('hidden')
          }
          renderListAndTags(wrapper, lines, tagsEl, searchInput, errorEl, options.openEditor)
          renderSavedFilters(card, wrapper, lines, options)
          searchInput.focus()
        })

        chip.querySelector('[data-action="star"]')?.addEventListener('click', async (e) => {
          e.stopPropagation()
          if (!options.runtime) return
          await setDefaultFilter(options.runtime, filterId)
          renderSavedFilters(card, wrapper, lines, options)
        })

        chip.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
          e.stopPropagation()
          const filter = store.filters.find((f) => f.id === filterId)
          if (!filter) return
          showEditForm(card, wrapper, filter, lines, options)
        })

        chip.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
          e.stopPropagation()
          if (!options.runtime) return
          await deleteFilter(options.runtime, filterId)
          renderSavedFilters(card, wrapper, lines, options)
        })
      })
  })
}
