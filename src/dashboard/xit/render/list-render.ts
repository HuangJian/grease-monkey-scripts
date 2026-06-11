import { escapeHtml } from '../../../utils'
import { parseQuery, filterItems } from '../query'
import type { XitItem, XitLine } from '../types'
import { getDueDateStatus, formatDueDateDisplay } from './due-date'
import { getQueryState } from './query-state'

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

export function renderItemHtml(line: XitItem): string {
  const checkboxChar = getCheckboxChar(line.status)
  let desc = line.description

  const tokens: string[] = []
  const T = '\uFFFD'
  function token(html: string): string {
    const i = tokens.length
    tokens.push(html)
    return `${T}${i}${T}`
  }

  desc = desc.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) =>
    token(
      `<a class="gm-sp-xit-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`,
    ),
  )

  desc = desc.replace(
    /(?<=\s|^)#([\w\d\u4e00-\u9fa5_-]+)(?:=([^\s#]+|"[^"]*"|'[^']*'))?/g,
    (match) => token(`<span class="gm-sp-xit-tag">${escapeHtml(match)}</span>`),
  )

  desc = desc.replace(
    /->\s*(\d{4}(?:-\d{2}-\d{2}|-\d{2}|-Q[1-4]|-W\d{1,2})?)/g,
    (_match, dateStr) => {
      const status = getDueDateStatus(dateStr)
      const display = formatDueDateDisplay(dateStr)
      let icon = ''
      if (line.status !== 'checked' && line.status !== 'obsolete') {
        if (status === 'overdue') icon = '⚠\uFE0F'
        else if (status === 'today') icon = '\u23F0'
        else if (status === 'tomorrow') icon = '\u23F3'
      }
      return token(
        `<span class="gm-sp-xit-duedate gm-sp-xit-due-${status}">${icon}${escapeHtml(display)}</span>`,
      )
    },
  )

  desc = escapeHtml(desc).replace(new RegExp(`${T}(\\d+)${T}`, 'g'), (_m, i) => tokens[Number(i)]!)

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

export function linesToHtml(lines: XitLine[]): string {
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

export function renderListAndTags(
  wrapper: HTMLElement,
  lines: XitLine[],
  tagsEl: HTMLElement | null,
  searchInput: HTMLInputElement | null,
  errorEl: HTMLElement | null,
  openEditor?: (lineIndex?: number) => void,
): void {
  const state = getQueryState(wrapper)
  const listEl = wrapper.querySelector('.gm-sp-xit-list') as HTMLElement

  const tagCounts = new Map<string, number>()
  for (const line of lines) {
    if (line.type === 'item') {
      for (const tag of line.tags) {
        const key = tag.name
        tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1)
      }
    }
  }

  if (tagCounts.size > 0 && tagsEl) {
    const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1])
    const tagsHtml = sortedTags
      .map(([name, count]) => {
        const isActive = state.query.includes(`#${name}`)
        const activeClass = isActive ? ' gm-sp-xit-tag-chip-active' : ''
        return `<button type="button" class="gm-sp-xit-tag-chip${activeClass}" data-tag="${escapeHtml(name)}">
          #${escapeHtml(name)} <span class="gm-sp-xit-tag-chip-count">${count}</span>
        </button>`
      })
      .join('')

    tagsEl.innerHTML = tagsHtml

    tagsEl.querySelectorAll<HTMLButtonElement>('.gm-sp-xit-tag-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const clickedTag = chip.dataset['tag'] ?? null
        if (!searchInput || !clickedTag) return

        const tagQuery = `#${clickedTag}`
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

  const isFiltering = state.query !== ''

  let displayLines: XitLine[] = []

  if (isFiltering) {
    const result = parseQuery(state.query)
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

  if (displayLines.length === 0) {
    listEl.innerHTML = `<div class="gm-sp-xit-empty">无符合条件的条目</div>`
    return
  }

  listEl.innerHTML = linesToHtml(displayLines)

  listEl.querySelectorAll<HTMLElement>('.gm-sp-xit-item').forEach((itemEl) => {
    itemEl.addEventListener('dblclick', () => {
      const idx = Number(itemEl.dataset['lineIndex'])
      if (!Number.isNaN(idx) && openEditor) {
        openEditor(idx)
      }
    })
  })
}
