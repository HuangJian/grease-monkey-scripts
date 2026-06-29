import type { VNode } from 'preact'
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

type DescriptionToken =
  | { type: 'text'; value: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'tag'; text: string }
  | { type: 'dueDate'; icon: string; display: string; dueClass: string }

type RawMatch = { start: number; end: number; token: DescriptionToken }

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g
const TAG_RE = /(?<=\s|^)#([\w\d\u4e00-\u9fa5_-]+)(?:=([^\s#]+|"[^"]*"|'[^']*'))?/g
const DUE_RE =
  /->\s*(everyday|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{4}(?:-\d{2}-\d{2}|-\d{2}|-Q[1-4]|-W\d{1,2})?)/g

function parseDescriptionTokens(line: XitItem): DescriptionToken[] {
  const desc = line.description
  const isCompleted = line.status === 'checked' || line.status === 'obsolete'
  const matches: RawMatch[] = []

  for (const m of desc.matchAll(LINK_RE)) {
    if (m.index === undefined) continue
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      token: { type: 'link', text: m[1]!, href: m[2]! },
    })
  }

  for (const m of desc.matchAll(TAG_RE)) {
    if (m.index === undefined) continue
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      token: { type: 'tag', text: m[0] },
    })
  }

  for (const m of desc.matchAll(DUE_RE)) {
    if (m.index === undefined) continue
    const dateStr = m[1]!
    let icon = ''
    let display = ''
    let dueClass: string

    if (dateStr === 'everyday') {
      if (!isCompleted) icon = '\u23F0'
      dueClass = 'gm-sp-xit-due-today'
    } else {
      const status = getDueDateStatus(dateStr)
      display = formatDueDateDisplay(dateStr)
      if (!isCompleted) {
        if (status === 'overdue') icon = '\u26A0\uFE0F'
        else if (status === 'today') icon = '\u23F0'
        else if (status === 'tomorrow') icon = '\u23F3'
      }
      dueClass = isCompleted ? 'gm-sp-xit-due-completed' : `gm-sp-xit-due-${status}`
    }

    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      token: { type: 'dueDate', icon, display, dueClass },
    })
  }

  // Sort by position; drop overlapping matches (first match wins).
  matches.sort((a, b) => a.start - b.start)
  const tokens: DescriptionToken[] = []
  let pos = 0
  for (const match of matches) {
    if (match.start < pos) continue
    if (match.start > pos) {
      tokens.push({ type: 'text', value: desc.slice(pos, match.start) })
    }
    tokens.push(match.token)
    pos = match.end
  }
  if (pos < desc.length) {
    tokens.push({ type: 'text', value: desc.slice(pos) })
  }
  return tokens
}

function renderDescription(line: XitItem): (VNode | string)[] {
  const tokens = parseDescriptionTokens(line)
  const elements: (VNode | string)[] = []

  for (const token of tokens) {
    if (token.type === 'text') {
      const parts = token.value.split('\n')
      parts.forEach((part, j) => {
        if (j > 0) {
          elements.push(<br />)
          elements.push(<span class="gm-sp-xit-indent">&nbsp;&nbsp;&nbsp;&nbsp;</span>)
        }
        if (part) elements.push(part)
      })
    } else if (token.type === 'link') {
      elements.push(
        <a class="gm-sp-xit-link" href={token.href} target="_blank" rel="noopener">
          {token.text}
        </a>,
      )
    } else if (token.type === 'tag') {
      elements.push(<span class="gm-sp-xit-tag">{token.text}</span>)
    } else {
      elements.push(
        <span class={`gm-sp-xit-duedate ${token.dueClass}`}>
          {token.icon}
          {token.display}
        </span>,
      )
    }
  }

  if (line.priority > 0) {
    elements.unshift(
      <span class={`gm-sp-xit-priority gm-sp-xit-prio-${line.priority}`}>{line.priorityText}</span>,
      ' ',
    )
  }

  return elements
}

type XitItemProps = {
  line: XitItem
}

function XitItem({ line }: XitItemProps) {
  const checkboxChar = getCheckboxChar(line.status)
  const isCompleted = line.status === 'checked' || line.status === 'obsolete'
  const completedClass = isCompleted ? ' gm-sp-xit-item-completed' : ''
  const dueToday =
    !isCompleted && line.dueDate !== null && getDueDateStatus(line.dueDate) === 'today'
  const boldClass = dueToday ? ' gm-sp-xit-content-bold' : ''

  return (
    <div
      class={`gm-sp-xit-item${completedClass}`}
      data-status={line.status}
      data-line-index={line.lineIndex}
    >
      <span class="gm-sp-xit-checkbox" data-status={line.status}>
        {checkboxChar}
      </span>
      <div class={`gm-sp-xit-content${boldClass}`}>{renderDescription(line)}</div>
    </div>
  )
}

type XitListProps = {
  lines: XitLine[]
}

export function XitList({ lines }: XitListProps) {
  return (
    <>
      {lines.map((line) => {
        if (line.type === 'heading') {
          return (
            <div class="gm-sp-xit-heading" key={line.lineIndex}>
              {line.text}
            </div>
          )
        }
        if (line.type === 'blank') {
          return <div class="gm-sp-xit-blank" key={line.lineIndex} />
        }
        if (line.type === 'comment') {
          return (
            <div class="gm-sp-xit-comment" key={line.lineIndex}>
              {line.text}
            </div>
          )
        }
        return <XitItem key={line.lineIndex} line={line} />
      })}
    </>
  )
}
