import { escapeHtml } from '../../utils'
import { parseXitText, parseDueDate } from './parser'
import type { XitData, XitLine } from './types'

const filterStates = new WeakMap<
  HTMLElement,
  {
    status: 'all' | 'open' | 'checked' | 'due'
    tag: string | null
    search: string
  }
>()

function getFilterState(container: HTMLElement) {
  let state = filterStates.get(container)
  if (!state) {
    state = {
      status: 'all',
      tag: null,
      search: '',
    }
    filterStates.set(container, state)
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

function isNearOrOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false
  const status = getDueDateStatus(dateStr)
  return status === 'overdue' || status === 'today' || status === 'tomorrow' || status === 'soon'
}

export function renderXit(
  container: HTMLElement,
  data: XitData | null,
  _options: { onSaveText: (newText: string) => void },
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
      const tabsEl = card.querySelector('.gm-sp-xit-tabs') as HTMLElement | null
      const tagsEl = card.querySelector('.gm-sp-xit-tags') as HTMLElement | null

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
          if (target.closest('.gm-sp-xit-tab') || target.closest('.gm-sp-xit-tag-chip')) {
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
        clearBtn.addEventListener('click', () => {
          searchInput.value = ''
          searchInput.focus()
          const state = getFilterState(wrapper)
          state.search = ''
          renderListAndTags(wrapper, lines, tagsEl, searchInput)
        })
      }

      if (searchInput) {
        searchInput.addEventListener('input', () => {
          const state = getFilterState(wrapper)
          state.search = searchInput.value.trim()
          renderListAndTags(wrapper, lines, tagsEl, searchInput)
        })
      }

      if (tabsEl) {
        const tabs = tabsEl.querySelectorAll<HTMLButtonElement>('.gm-sp-xit-tab')
        tabs.forEach((tab) => {
          tab.addEventListener('click', () => {
            tabs.forEach((t) => t.classList.remove('gm-sp-xit-tab-active'))
            tab.classList.add('gm-sp-xit-tab-active')
            const state = getFilterState(wrapper)
            state.status = tab.dataset['status'] as any
            renderListAndTags(wrapper, lines, tagsEl, searchInput)
          })
        })
      }
    }
  }

  // Update dynamic elements
  const card = container.parentElement
  const tagsEl = card?.querySelector('.gm-sp-xit-tags') as HTMLElement | null
  const searchInput = card?.querySelector('.gm-sp-xit-header-search') as HTMLInputElement | null
  renderListAndTags(wrapper, lines, tagsEl, searchInput)
}

function renderListAndTags(
  wrapper: HTMLElement,
  lines: XitLine[],
  tagsEl: HTMLElement | null,
  searchInput: HTMLInputElement | null,
): void {
  const state = getFilterState(wrapper)
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
        const activeClass = state.tag === name ? ' gm-sp-xit-tag-chip-active' : ''
        return `<button type="button" class="gm-sp-xit-tag-chip${activeClass}" data-tag="${escapeHtml(name)}">
          #${escapeHtml(name)} <span class="gm-sp-xit-tag-chip-count">${count}</span>
        </button>`
      })
      .join('')

    tagsEl.innerHTML = tagsHtml
    tagsEl.classList.remove('hidden')

    // Wire tag clicks
    tagsEl.querySelectorAll<HTMLButtonElement>('.gm-sp-xit-tag-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const clickedTag = chip.dataset['tag'] ?? null
        if (state.tag === clickedTag) {
          state.tag = null
        } else {
          state.tag = clickedTag
        }
        if (searchInput) {
          searchInput.value = state.tag ? `#${state.tag}` : ''
        }
        renderListAndTags(wrapper, lines, tagsEl, searchInput)
      })
    })
  } else if (tagsEl) {
    tagsEl.innerHTML = ''
    tagsEl.classList.add('hidden')
    state.tag = null
  }

  // Filter lines
  const isFiltering = state.status !== 'all' || state.tag !== null || state.search !== ''

  let displayLines: XitLine[] = []

  if (isFiltering) {
    displayLines = lines.filter((line) => {
      if (line.type !== 'item') return false

      // Status filter
      if (state.status === 'open') {
        if (line.status === 'checked' || line.status === 'obsolete') return false
      } else if (state.status === 'checked') {
        if (line.status !== 'checked' && line.status !== 'obsolete') return false
      } else if (state.status === 'due') {
        if (
          line.status === 'checked' ||
          line.status === 'obsolete' ||
          !isNearOrOverdue(line.dueDate)
        ) {
          return false
        }
      }

      // Tag filter
      if (state.tag) {
        if (!line.tags.some((t) => t.name === state.tag)) return false
      }

      // Text search query
      if (state.search) {
        const query = state.search.toLowerCase()
        const matchDesc = line.description.toLowerCase().includes(query)
        const matchTags = line.tags.some(
          (t) => t.name.includes(query) || (t.value && t.value.toLowerCase().includes(query)),
        )
        if (!matchDesc && !matchTags) return false
      }

      return true
    })
  } else {
    displayLines = lines
  }

  // Render HTML
  if (displayLines.length === 0) {
    listEl.innerHTML = `<div class="gm-sp-xit-empty">无符合条件的条目</div>`
    return
  }

  const listHtml = displayLines
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

      // Render XitItem
      const checkboxChar = getCheckboxChar(line.status)
      let descHtml = escapeHtml(line.description)

      // Highlight tags
      descHtml = descHtml.replace(
        /(#[\w\d\u4e00-\u9fa5_-]+(?:=(?:[^\s#]+|"[^"]*"|'[^']*'))?)/gi,
        (match) => {
          return `<span class="gm-sp-xit-tag">${match}</span>`
        },
      )

      // Highlight due dates and show warnings
      descHtml = descHtml.replace(
        /(->\s*(\d{4}(?:-\d{2}-\d{2}|-\d{2}|-Q[1-4]|-W\d{1,2})?))/g,
        (match, p1, dateStr) => {
          const status = getDueDateStatus(dateStr)
          let alertText = ''
          if (line.status !== 'checked' && line.status !== 'obsolete') {
            if (status === 'overdue') alertText = ' (已逾期 ⚠️)'
            else if (status === 'today') alertText = ' (今天到期 ⏰)'
            else if (status === 'tomorrow') alertText = ' (明天到期)'
          }
          return `<span class="gm-sp-xit-duedate gm-sp-xit-due-${status}">${match}${alertText}</span>`
        },
      )

      // Highlight multi-line indentation
      descHtml = descHtml.replace(
        /\n/g,
        '<br><span class="gm-sp-xit-indent">&nbsp;&nbsp;&nbsp;&nbsp;</span>',
      )

      const priorityClass = line.priority > 0 ? ` gm-sp-xit-prio-${line.priority}` : ''
      const prioHtml =
        line.priority > 0
          ? `<span class="gm-sp-xit-priority${priorityClass}">${escapeHtml(line.priorityText)}</span> `
          : ''

      const isCompleted = line.status === 'checked' || line.status === 'obsolete'
      const completedClass = isCompleted ? ' gm-sp-xit-item-completed' : ''

      return `<div class="gm-sp-xit-item${completedClass}" data-status="${line.status}">
        <span class="gm-sp-xit-checkbox" data-status="${line.status}">${escapeHtml(checkboxChar)}</span>
        <div class="gm-sp-xit-content">${prioHtml}${descHtml}</div>
      </div>`
    })
    .join('')

  listEl.innerHTML = listHtml
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
