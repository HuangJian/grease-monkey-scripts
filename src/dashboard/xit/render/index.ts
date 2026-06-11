import { parseXitText } from '../parser'
import { parseQuery } from '../query'
import { loadFilters, getDefaultFilter, addFilter } from '../filters'
import type { XitData } from '../types'
import { getQueryState } from './query-state'
import { renderListAndTags } from './list-render'
import { renderSavedFilters } from './saved-filters'
import type { XitRenderOptions } from './edit-form'

export type { XitRenderOptions }
export { renderXitPreview } from './preview'

export function renderXit(
  container: HTMLElement,
  data: XitData | null,
  options: XitRenderOptions,
): void {
  const text = data?.text ?? ''
  const lines = parseXitText(text)

  let wrapper = container.querySelector('.gm-sp-xit') as HTMLElement
  if (!wrapper) {
    container.replaceChildren()
    container.insertAdjacentHTML(
      'beforeend',
      `<div class="gm-sp-xit">
        <div class="gm-sp-xit-list"></div>
      </div>`,
    )
    wrapper = container.querySelector('.gm-sp-xit')!

    const card = container.parentElement
    if (card) {
      const searchInput = card.querySelector('.gm-sp-xit-header-search') as HTMLInputElement | null
      const filtersPanel = card.querySelector('.gm-sp-xit-header-filters') as HTMLElement | null
      const tagsEl = card.querySelector('.gm-sp-xit-tags') as HTMLElement | null
      const errorEl = card.querySelector('.gm-sp-error') as HTMLElement | null

      if (searchInput && filtersPanel) {
        const showFilters = () => {
          filtersPanel.classList.remove('hidden')
        }
        const hideFilters = () => {
          filtersPanel.classList.add('hidden')
        }

        searchInput.addEventListener('focus', showFilters)
        searchInput.addEventListener('blur', (e) => {
          if (!filtersPanel.contains(e.relatedTarget as Node)) {
            hideFilters()
          }
        })
        filtersPanel.addEventListener('mousedown', (e) => {
          if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault()
        })
        card.addEventListener('click', (e) => {
          const target = e.target as HTMLElement
          if (target.closest('.gm-sp-xit-tag-chip') || target.closest('.gm-sp-xit-saved-filter')) {
            searchInput.focus()
          }
        })

        searchInput.insertAdjacentHTML(
          'afterend',
          '<button type="button" class="gm-sp-edit" aria-label="clear">\u00d7</button>',
        )
        const clearBtn = searchInput.nextElementSibling as HTMLButtonElement

        clearBtn.insertAdjacentHTML(
          'afterend',
          '<button type="button" class="gm-sp-edit" aria-label="save filter">+</button>',
        )
        const saveBtn = clearBtn.nextElementSibling as HTMLButtonElement

        let saveFormEl: HTMLElement | null = null

        function removeSaveForm() {
          if (saveFormEl) {
            saveFormEl.remove()
            saveFormEl = null
          }
        }

        function showSaveForm(query: string) {
          removeSaveForm()
          const formFragment = container.ownerDocument.createRange().createContextualFragment(
            `<div class="gm-sp-xit-save-form">
              <input type="text" class="gm-sp-xit-save-name" placeholder="Name">
              <input type="text" class="gm-sp-xit-save-query" placeholder="Query" value="${query}">
              <button type="button" class="gm-sp-xit-save-confirm">Save</button>
              <button type="button" class="gm-sp-xit-save-cancel">Cancel</button>
            </div>`,
          )
          saveFormEl = formFragment.firstElementChild as HTMLElement
          const nameInput = saveFormEl.querySelector('.gm-sp-xit-save-name') as HTMLInputElement
          const queryInput = saveFormEl.querySelector('.gm-sp-xit-save-query') as HTMLInputElement
          const confirmBtn = saveFormEl.querySelector(
            '.gm-sp-xit-save-confirm',
          ) as HTMLButtonElement
          const cancelBtn = saveFormEl.querySelector('.gm-sp-xit-save-cancel') as HTMLButtonElement

          const headerRow = card!.querySelector('.gm-sp-xit-header-row')
          if (headerRow?.nextElementSibling) {
            headerRow.parentElement!.insertBefore(saveFormEl, headerRow.nextElementSibling)
          }

          nameInput.focus()

          confirmBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim()
            const q = queryInput.value.trim()
            if (!name || !q || !options.runtime) return
            await addFilter(options.runtime, name, q)
            removeSaveForm()
            renderSavedFilters(card!, wrapper, lines, options)
          })

          cancelBtn.addEventListener('click', () => {
            removeSaveForm()
          })

          nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmBtn.click()
            if (e.key === 'Escape') cancelBtn.click()
            e.stopPropagation()
          })
          queryInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmBtn.click()
            if (e.key === 'Escape') cancelBtn.click()
            e.stopPropagation()
          })
        }

        saveBtn.addEventListener('click', () => {
          const state = getQueryState(wrapper)
          if (state.query) showSaveForm(state.query)
        })

        clearBtn.addEventListener('click', () => {
          searchInput.value = ''
          searchInput.focus()
          const state = getQueryState(wrapper)
          state.query = ''
          state.error = null
          searchInput.classList.remove('gm-sp-xit-query-error')
          if (errorEl) {
            errorEl.textContent = ''
            errorEl.classList.add('hidden')
          }
          removeSaveForm()
          renderListAndTags(wrapper, lines, tagsEl, searchInput, errorEl, options.openEditor)
          renderSavedFilters(card, wrapper, lines, options)
        })
      }

      if (searchInput) {
        searchInput.addEventListener('input', () => {
          const state = getQueryState(wrapper)
          state.query = searchInput.value.trim()

          const result = parseQuery(state.query)
          if (result.ok) {
            state.error = null
            searchInput.classList.remove('gm-sp-xit-query-error')
            if (errorEl) {
              errorEl.textContent = ''
              errorEl.classList.add('hidden')
            }
          } else {
            state.error = result.error
            searchInput.classList.add('gm-sp-xit-query-error')
            if (errorEl) {
              errorEl.textContent = result.error
              errorEl.classList.remove('hidden')
            }
          }

          renderListAndTags(wrapper, lines, tagsEl, searchInput, errorEl, options.openEditor)
          renderSavedFilters(card, wrapper, lines, options)
        })
      }

      const filterNameSpan = card.querySelector('.gm-sp-xit-filter-name') as HTMLElement
      if (filterNameSpan) {
        filterNameSpan.addEventListener('click', (e) => {
          e.stopPropagation()
          if (searchInput) searchInput.focus()
        })
      }

      if (options.runtime) {
        loadFilters(options.runtime).then((store) => {
          const defaultFilter = getDefaultFilter(store)
          if (defaultFilter && !getQueryState(wrapper).query && searchInput) {
            searchInput.value = defaultFilter.query
            const state = getQueryState(wrapper)
            state.query = defaultFilter.query
            state.error = null
            renderListAndTags(wrapper, lines, tagsEl, searchInput, errorEl, options.openEditor)
          }
          renderSavedFilters(card, wrapper, lines, options)
        })
      }
    }
  }

  const card = container.parentElement
  const tagsEl = card?.querySelector('.gm-sp-xit-tags') as HTMLElement | null
  const searchInput = card?.querySelector('.gm-sp-xit-header-search') as HTMLInputElement | null
  const errorEl = card?.querySelector('.gm-sp-error') as HTMLElement | null
  renderListAndTags(wrapper, lines, tagsEl, searchInput, errorEl, options.openEditor)
}
