import { escapeHtml } from '../../utils'
import { parseXitText, parseDueDate } from './parser'
import { parseQuery, filterItems } from './query'
import type { XitData, XitItem, XitLine } from './types'

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
      const tabsEl = card.querySelector('.gm-sp-xit-tabs') as HTMLElement | null
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
          const state = getQueryState(wrapper)
          state.query = ''
          state.error = null
          searchInput.classList.remove('gm-sp-xit-query-error')
          if (errorEl) {
            errorEl.textContent = ''
            errorEl.classList.add('hidden')
          }
          renderListAndTags(wrapper, lines, tagsEl, searchInput, errorEl, options.openEditor)
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
        })
      }

      if (tabsEl) {
        const tabs = tabsEl.querySelectorAll<HTMLButtonElement>('.gm-sp-xit-tab')
        tabs.forEach((tab) => {
          tab.addEventListener('click', () => {
            const statusMap: Record<string, string> = {
              all: '',
              open: '[ ]',
              checked: '[x]',
              due: 'overdue',
            }
            const statusQuery = statusMap[tab.dataset['status'] ?? ''] ?? ''

            // Update active tab visually
            tabs.forEach((t) => t.classList.remove('gm-sp-xit-tab-active'))
            tab.classList.add('gm-sp-xit-tab-active')

            // Set query
            if (searchInput) {
              searchInput.value = statusQuery
              const state = getQueryState(wrapper)
              state.query = statusQuery
              state.error = null
              searchInput.classList.remove('gm-sp-xit-query-error')
              if (errorEl) {
                errorEl.textContent = ''
                errorEl.classList.add('hidden')
              }
              renderListAndTags(wrapper, lines, tagsEl, searchInput, errorEl, options.openEditor)
            }
          })
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
    tagsEl.classList.remove('hidden')

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
    tagsEl.classList.add('hidden')
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
