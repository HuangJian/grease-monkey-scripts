import { escapeHtml } from '../../utils'
import type { Runtime } from '../../runtime'
import { parseXitText, parseDueDate } from './parser'
import { parseQuery, filterItems } from './query'
import {
  loadFilters,
  addFilter,
  updateFilter,
  deleteFilter,
  setDefaultFilter,
  getDefaultFilter,
} from './filters'
import type { XitData, XitItem, XitLine, NamedFilter, NamedFilterStore } from './types'

const queryStates = new WeakMap<HTMLElement, { query: string; error: string | null }>()

function getQueryState(container: HTMLElement) {
  let state = queryStates.get(container)
  if (!state) {
    state = { query: '', error: null }
    queryStates.set(container, state)
  }
  return state
}

export function getDueDateStatus(
  dateStr: string,
): 'overdue' | 'today' | 'tomorrow' | 'soon' | 'future' | 'invalid' {
  const d = parseDueDate(dateStr)
  if (!d) return 'invalid'

  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

  const tomorrowStart = new Date(todayStart.getTime() + 24 * 3600 * 1000)
  const tomorrowEnd = new Date(todayEnd.getTime() + 24 * 3600 * 1000)

  const soonEnd = new Date(todayEnd.getTime() + 3 * 24 * 3600 * 1000) // 3 days threshold

  const time = d.getTime()
  if (time < todayStart.getTime()) {
    return 'overdue'
  } else if (time >= todayStart.getTime() && time <= todayEnd.getTime()) {
    return 'today'
  } else if (time >= tomorrowStart.getTime() && time <= tomorrowEnd.getTime()) {
    return 'tomorrow'
  } else if (time > tomorrowEnd.getTime() && time <= soonEnd.getTime()) {
    return 'soon'
  } else {
    return 'future'
  }
}

function formatDueDateDisplay(dateStr: string): string {
  const currentYear = new Date().getFullYear()
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (ymd) {
    return Number(ymd[1]) === currentYear ? `${ymd[2]}-${ymd[3]}` : dateStr
  }
  const ym = /^(\d{4})-(\d{2})$/.exec(dateStr)
  if (ym) {
    return Number(ym[1]) === currentYear ? ym[2] : dateStr
  }
  const yq = /^(\d{4})-(Q[1-4])$/.exec(dateStr)
  if (yq) {
    return Number(yq[1]) === currentYear ? yq[2] : dateStr
  }
  const yw = /^(\d{4})-(W\d{1,2})$/.exec(dateStr)
  if (yw) {
    return Number(yw[1]) === currentYear ? yw[2] : dateStr
  }
  return dateStr
}

export type XitRenderOptions = {
  onSaveText: (newText: string) => void
  openEditor?: (lineIndex?: number) => void
  runtime?: Runtime
}

export function renderXit(
  container: HTMLElement,
  data: XitData | null,
  options: XitRenderOptions,
): void {
  const text = data?.text ?? ''
  const lines = parseXitText(text)

  // Initialize main container shell if not already present
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

    // Wire header search input and filters
    const card = container.parentElement
    if (card) {
      const searchInput = card.querySelector('.gm-sp-xit-header-search') as HTMLInputElement | null
      const filtersPanel = card.querySelector('.gm-sp-xit-header-filters') as HTMLElement | null
      const tagsEl = card.querySelector('.gm-sp-xit-tags') as HTMLElement | null
      const errorEl = card.querySelector('.gm-sp-xit-error') as HTMLElement | null

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

        // Clear button — always present, same style as edit button
        const clearBtn = container.ownerDocument.createElement('button')
        clearBtn.type = 'button'
        clearBtn.className = 'gm-sp-edit'
        clearBtn.setAttribute('aria-label', 'clear')
        clearBtn.textContent = '\u00d7'
        searchInput.parentElement!.insertBefore(clearBtn, searchInput.nextElementSibling)

        // Save filter button (+)
        const saveBtn = container.ownerDocument.createElement('button')
        saveBtn.type = 'button'
        saveBtn.className = 'gm-sp-edit'
        saveBtn.setAttribute('aria-label', 'save filter')
        saveBtn.textContent = '+'
        searchInput.parentElement!.insertBefore(saveBtn, clearBtn.nextElementSibling)

        let saveFormEl: HTMLElement | null = null

        function removeSaveForm() {
          if (saveFormEl) {
            saveFormEl.remove()
            saveFormEl = null
          }
        }

        function showSaveForm(query: string, existingFilter?: NamedFilter) {
          removeSaveForm()
          saveFormEl = container.ownerDocument.createElement('div')
          saveFormEl.className = 'gm-sp-xit-save-form'
          const nameInput = container.ownerDocument.createElement('input')
          nameInput.type = 'text'
          nameInput.className = 'gm-sp-xit-save-name'
          nameInput.placeholder = 'Name'
          if (existingFilter) nameInput.value = existingFilter.name
          const queryInput = container.ownerDocument.createElement('input')
          queryInput.type = 'text'
          queryInput.className = 'gm-sp-xit-save-query'
          queryInput.placeholder = 'Query'
          queryInput.value = query
          const confirmBtn = container.ownerDocument.createElement('button')
          confirmBtn.type = 'button'
          confirmBtn.className = 'gm-sp-xit-save-confirm'
          confirmBtn.textContent = 'Save'
          const cancelBtn = container.ownerDocument.createElement('button')
          cancelBtn.type = 'button'
          cancelBtn.className = 'gm-sp-xit-save-cancel'
          cancelBtn.textContent = 'Cancel'
          saveFormEl.append(nameInput, queryInput, confirmBtn, cancelBtn)

          // Insert form after the header row
          const headerRow = card!.querySelector('.gm-sp-xit-header-row')
          if (headerRow?.nextElementSibling) {
            headerRow.parentElement!.insertBefore(saveFormEl, headerRow.nextElementSibling)
          }

          nameInput.focus()

          confirmBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim()
            const q = queryInput.value.trim()
            if (!name || !q || !options.runtime) return
            if (existingFilter) {
              await updateFilter(options.runtime, existingFilter.id, { name, query: q })
            } else {
              await addFilter(options.runtime, name, q)
            }
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

      // Wire filter name span click — show saved filters panel
      const filterNameSpan = card.querySelector('.gm-sp-xit-filter-name') as HTMLElement
      if (filterNameSpan) {
        filterNameSpan.addEventListener('click', (e) => {
          e.stopPropagation()
          if (searchInput) searchInput.focus()
        })
      }

      // Load default filter and render saved filters
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

  // Update dynamic elements
  const card = container.parentElement
  const tagsEl = card?.querySelector('.gm-sp-xit-tags') as HTMLElement | null
  const searchInput = card?.querySelector('.gm-sp-xit-header-search') as HTMLInputElement | null
  const errorEl = card?.querySelector('.gm-sp-xit-error') as HTMLElement | null
  renderListAndTags(wrapper, lines, tagsEl, searchInput, errorEl, options.openEditor)
}

function renderListAndTags(
  wrapper: HTMLElement,
  lines: XitLine[],
  tagsEl: HTMLElement | null,
  searchInput: HTMLInputElement | null,
  errorEl: HTMLElement | null,
  openEditor?: (lineIndex?: number) => void,
): void {
  const state = getQueryState(wrapper)
  const listEl = wrapper.querySelector('.gm-sp-xit-list') as HTMLElement

  // Calculate tags count from all item lines
  const tagCounts = new Map<string, number>()
  for (const line of lines) {
    if (line.type === 'item') {
      for (const tag of line.tags) {
        const key = tag.name
        tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1)
      }
    }
  }

  // Render tag filter chips if any tags exist
  if (tagCounts.size > 0 && tagsEl) {
    const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1])
    const tagsHtml = sortedTags
      .map(([name, count]) => {
        // Check if this tag is active in the current query
        const isActive = state.query.includes(`#${name}`)
        const activeClass = isActive ? ' gm-sp-xit-tag-chip-active' : ''
        return `<button type="button" class="gm-sp-xit-tag-chip${activeClass}" data-tag="${escapeHtml(name)}">
          #${escapeHtml(name)} <span class="gm-sp-xit-tag-chip-count">${count}</span>
        </button>`
      })
      .join('')

    tagsEl.innerHTML = tagsHtml

    // Wire tag clicks
    tagsEl.querySelectorAll<HTMLButtonElement>('.gm-sp-xit-tag-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const clickedTag = chip.dataset['tag'] ?? null
        if (!searchInput || !clickedTag) return

        const tagQuery = `#${clickedTag}`
        // Toggle: if already in query, remove it; otherwise append it
        if (state.query.includes(tagQuery)) {
          state.query = state.query.replace(tagQuery, '').replace(/\s+/g, ' ').trim()
        } else {
          state.query = state.query ? `${state.query} ${tagQuery}` : tagQuery
        }
        searchInput.value = state.query

        const result = parseQuery(state.query)
        state.error = result.ok ? null : result.error
        if (result.ok) {
          searchInput.classList.remove('gm-sp-xit-query-error')
          if (errorEl) {
            errorEl.textContent = ''
            errorEl.classList.add('hidden')
          }
        } else {
          searchInput.classList.add('gm-sp-xit-query-error')
          if (errorEl) {
            errorEl.textContent = result.error
            errorEl.classList.remove('hidden')
          }
        }

        renderListAndTags(wrapper, lines, tagsEl, searchInput, errorEl, openEditor)
      })
    })
  } else if (tagsEl) {
    tagsEl.innerHTML = ''
  }

  // Filter lines
  const isFiltering = state.query !== ''

  let displayLines: XitLine[] = []

  if (isFiltering) {
    const result = parseQuery(state.query)
    if (result.ok) {
      displayLines = filterItems(lines, result.ast)
      // Also include headings that precede matching items
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
    } else {
      // Parse error: show all items
      displayLines = lines.filter((l) => l.type !== 'blank')
    }
  } else {
    displayLines = lines
  }

  if (displayLines.length === 0) {
    listEl.innerHTML = `<div class="gm-sp-xit-empty">无符合条件的条目</div>`
    return
  }

  listEl.innerHTML = linesToHtml(displayLines)

  // Wire double-click on items to open editor at that line
  listEl.querySelectorAll<HTMLElement>('.gm-sp-xit-item').forEach((itemEl) => {
    itemEl.addEventListener('dblclick', () => {
      const idx = Number(itemEl.dataset['lineIndex'])
      if (!Number.isNaN(idx) && openEditor) {
        openEditor(idx)
      }
    })
  })
}

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

function renderSavedFilters(
  card: HTMLElement,
  wrapper: HTMLElement,
  lines: XitLine[],
  options: XitRenderOptions,
): void {
  const savedFiltersEl = card.querySelector('.gm-sp-xit-saved-filters') as HTMLElement | null
  const searchInput = card.querySelector('.gm-sp-xit-header-search') as HTMLInputElement | null
  const tagsEl = card.querySelector('.gm-sp-xit-tags') as HTMLElement | null
  const errorEl = card.querySelector('.gm-sp-xit-error') as HTMLElement | null
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

    // Wire chip events
    savedFiltersEl
      .querySelectorAll<HTMLButtonElement>('.gm-sp-xit-saved-filter')
      .forEach((chip) => {
        const filterId = chip.dataset['filterId'] ?? ''

        // Chip click — apply filter
        chip.addEventListener('click', (e) => {
          const target = e.target as HTMLElement
          // Ignore clicks on action buttons
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

        // Star click — toggle default
        chip.querySelector('[data-action="star"]')?.addEventListener('click', async (e) => {
          e.stopPropagation()
          if (!options.runtime) return
          await setDefaultFilter(options.runtime, filterId)
          renderSavedFilters(card, wrapper, lines, options)
        })

        // Edit click — show edit form
        chip.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
          e.stopPropagation()
          const filter = store.filters.find((f) => f.id === filterId)
          if (!filter) return
          showEditForm(card, wrapper, filter, lines, options)
        })

        // Delete click — remove filter
        chip.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
          e.stopPropagation()
          if (!options.runtime) return
          await deleteFilter(options.runtime, filterId)
          renderSavedFilters(card, wrapper, lines, options)
        })
      })
  })
}

function showEditForm(
  card: HTMLElement,
  wrapper: HTMLElement,
  filter: NamedFilter,
  lines: XitLine[],
  options: XitRenderOptions,
): void {
  // Remove any existing save form
  const existingForm = card.querySelector('.gm-sp-xit-save-form')
  if (existingForm) existingForm.remove()

  const formEl = card.ownerDocument.createElement('div')
  formEl.className = 'gm-sp-xit-save-form'
  const nameInput = card.ownerDocument.createElement('input')
  nameInput.type = 'text'
  nameInput.className = 'gm-sp-xit-save-name'
  nameInput.placeholder = 'Name'
  nameInput.value = filter.name
  const queryInput = card.ownerDocument.createElement('input')
  queryInput.type = 'text'
  queryInput.className = 'gm-sp-xit-save-query'
  queryInput.placeholder = 'Query'
  queryInput.value = filter.query
  const confirmBtn = card.ownerDocument.createElement('button')
  confirmBtn.type = 'button'
  confirmBtn.className = 'gm-sp-xit-save-confirm'
  confirmBtn.textContent = 'Save'
  const cancelBtn = card.ownerDocument.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'gm-sp-xit-save-cancel'
  cancelBtn.textContent = 'Cancel'
  formEl.append(nameInput, queryInput, confirmBtn, cancelBtn)

  const headerRow = card.querySelector('.gm-sp-xit-header-row')
  if (headerRow?.nextElementSibling) {
    headerRow.parentElement!.insertBefore(formEl, headerRow.nextElementSibling)
  }

  nameInput.focus()
  nameInput.select()

  confirmBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim()
    const q = queryInput.value.trim()
    if (!name || !q || !options.runtime) return
    await updateFilter(options.runtime, filter.id, { name, query: q })
    formEl.remove()
    renderSavedFilters(card, wrapper, lines, options)
  })

  cancelBtn.addEventListener('click', () => {
    formEl.remove()
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

function getCheckboxChar(status: string): string {
  switch (status) {
    case 'checked':
      return '[x]'
    case 'ongoing':
      return '[@]'
    case 'obsolete':
      return '[~]'
    case 'in-question':
      return '[?]'
    default:
      return '[ ]'
  }
}

function renderItemHtml(line: XitItem): string {
  const checkboxChar = getCheckboxChar(line.status)
  let desc = line.description

  // Token-based inline extraction: replace matched patterns with placeholders
  // to avoid regex collision (e.g., tag regex matching inside link text).
  const tokens: string[] = []
  // Token placeholder: uses U+FFFD (replacement character) as delimiter
  // to avoid control-char lint warnings. Survives escapeHtml.
  const T = '\uFFFD'
  function token(html: string): string {
    const i = tokens.length
    tokens.push(html)
    return `${T}${i}${T}`
  }

  // 1. Markdown links: [text](url) — extract first to protect brackets from other regexes
  desc = desc.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) =>
    token(
      `<a class="gm-sp-xit-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`,
    ),
  )

  // 2. Tags: #name or #name=value
  desc = desc.replace(
    /(?<=\s|^)#([\w\d\u4e00-\u9fa5_-]+)(?:=([^\s#]+|"[^"]*"|'[^']*'))?/g,
    (match) => token(`<span class="gm-sp-xit-tag">${escapeHtml(match)}</span>`),
  )

  // 3. Due dates: -> YYYY-MM-DD (etc.)
  desc = desc.replace(
    /->\s*(\d{4}(?:-\d{2}-\d{2}|-\d{2}|-Q[1-4]|-W\d{1,2})?)/g,
    (_match, dateStr) => {
      const status = getDueDateStatus(dateStr)
      const display = formatDueDateDisplay(dateStr)
      let icon = ''
      if (line.status !== 'checked' && line.status !== 'obsolete') {
        if (status === 'overdue') icon = '⚠️'
        else if (status === 'today') icon = '⏰'
        else if (status === 'tomorrow') icon = '⏳'
      }
      return token(
        `<span class="gm-sp-xit-duedate gm-sp-xit-due-${status}">${icon}${escapeHtml(display)}</span>`,
      )
    },
  )

  // Escape remaining plain text, then restore tokens
  desc = escapeHtml(desc).replace(new RegExp(`${T}(\\d+)${T}`, 'g'), (_m, i) => tokens[Number(i)]!)

  // Newlines → indented line breaks
  desc = desc.replace(/\n/g, '<br><span class="gm-sp-xit-indent">&nbsp;&nbsp;&nbsp;&nbsp;</span>')

  const priorityClass = line.priority > 0 ? ` gm-sp-xit-prio-${line.priority}` : ''
  const prioHtml =
    line.priority > 0
      ? `<span class="gm-sp-xit-priority${priorityClass}">${escapeHtml(line.priorityText)}</span> `
      : ''

  const isCompleted = line.status === 'checked' || line.status === 'obsolete'
  const completedClass = isCompleted ? ' gm-sp-xit-item-completed' : ''

  return `<div class="gm-sp-xit-item${completedClass}" data-status="${line.status}" data-line-index="${line.lineIndex}">
    <span class="gm-sp-xit-checkbox" data-status="${line.status}">${escapeHtml(checkboxChar)}</span>
    <div class="gm-sp-xit-content">${prioHtml}${desc}</div>
  </div>`
}

function linesToHtml(lines: XitLine[]): string {
  return lines
    .map((line) => {
      if (line.type === 'heading') {
        return `<div class="gm-sp-xit-heading">${escapeHtml(line.text)}</div>`
      }
      if (line.type === 'blank') {
        return `<div class="gm-sp-xit-blank"></div>`
      }
      if (line.type === 'comment') {
        return `<div class="gm-sp-xit-comment">${escapeHtml(line.text)}</div>`
      }
      return renderItemHtml(line)
    })
    .join('')
}

export function renderXitPreview(container: HTMLElement, text: string): void {
  const lines = parseXitText(text)
  if (lines.length === 0) {
    container.innerHTML = `<div class="gm-sp-xit-empty">无内容</div>`
    return
  }
  container.innerHTML = linesToHtml(lines)
}
