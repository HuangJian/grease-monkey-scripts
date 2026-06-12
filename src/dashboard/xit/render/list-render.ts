import { escapeHtml } from '../../../utils'
import type { XitItem, XitLine } from '../types'
import { getDueDateStatus, formatDueDateDisplay } from './due-date'

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
    /->\s*(everyday|\d{4}(?:-\d{2}-\d{2}|-\d{2}|-Q[1-4]|-W\d{1,2})?)/g,
    (_match, dateStr) => {
      const status = getDueDateStatus(dateStr)
      if (dateStr === 'everyday') {
        const icon = line.status !== 'checked' && line.status !== 'obsolete' ? '\u23F0' : ''
        return token(`<span class="gm-sp-xit-duedate gm-sp-xit-due-today">${icon}</span>`)
      }
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
  const dueToday =
    !isCompleted && line.dueDate !== null && getDueDateStatus(line.dueDate) === 'today'
  const boldClass = dueToday ? ' gm-sp-xit-content-bold' : ''

  return `<div class="gm-sp-xit-item${completedClass}" data-status="${line.status}" data-line-index="${line.lineIndex}">
    <span class="gm-sp-xit-checkbox" data-status="${line.status}">${escapeHtml(checkboxChar)}</span>
    <div class="gm-sp-xit-content${boldClass}">${prioHtml}${desc}</div>
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
