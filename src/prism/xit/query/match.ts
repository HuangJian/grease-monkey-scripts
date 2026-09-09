import { parseDueDate, isWeekdayName, weekdayNumber } from '../parser'
import type { XitItem, XitLine } from '../types'
import type { DateKeyword, QueryNode } from './types'
import { resolveDateKeyword, parseDateValue } from './date-math'

/** Relative date keywords accepted by `matchDate` (kept as `readonly string[]`
 * so `includes` needs no `as any` escape — see the §2.6 audit note). */
const RELATIVE_DATE_KEYWORDS: readonly string[] = [
  'today',
  'thisweek',
  'thismonth',
  'thisyear',
  'everyday',
]

function matchDate(
  item: XitItem,
  op: string,
  value: string,
  offset?: number,
  now: Date = new Date(),
): boolean {
  if (!item.dueDate) return false
  const itemDate = parseDueDate(item.dueDate, now)
  if (!itemDate) return false

  if (RELATIVE_DATE_KEYWORDS.includes(value) || isWeekdayName(value)) {
    const range = resolveDateKeyword(value as DateKeyword, offset, now)
    if (!range) return false
    const t = itemDate.getTime()
    switch (op) {
      case '>':
        return t >= range.end.getTime()
      case '<':
        return t < range.start.getTime()
      case '>=':
        return t >= range.start.getTime()
      case '<=':
        return t < range.end.getTime()
      case '=':
        return t >= range.start.getTime() && t < range.end.getTime()
      default:
        return false
    }
  }

  const targetDate = parseDateValue(value, now)
  if (!targetDate) return false

  const t = itemDate.getTime()
  const v = targetDate.getTime()

  switch (op) {
    case '>':
      return t > v
    case '<':
      return t < v
    case '>=':
      return t >= v
    case '<=':
      return t <= v
    case '=':
      return t === v
    default:
      return false
  }
}

function matchDatePeriod(
  item: XitItem,
  periodSpec: string,
  offset?: number,
  now: Date = new Date(),
): boolean {
  if (!item.dueDate) return false

  // ~thisweek + ->weekday: match if weekday >= today's day-of-week (Sun=7)
  if (periodSpec === 'thisweek' && isWeekdayName(item.dueDate)) {
    const todayDow = now.getDay() || 7
    return weekdayNumber(item.dueDate) >= todayDow
  }

  const itemDate = parseDueDate(item.dueDate, now)
  if (!itemDate) return false

  const t = itemDate.getTime()

  if (
    ['today', 'thisweek', 'thismonth', 'thisyear', 'everyday'].includes(periodSpec) ||
    isWeekdayName(periodSpec)
  ) {
    const range = resolveDateKeyword(periodSpec as DateKeyword, offset, now)
    if (!range) return false
    return t >= range.start.getTime() && t < range.end.getTime()
  }

  const bareQ = /^[Qq]([1-4])$/.exec(periodSpec)
  if (bareQ) {
    const year = now.getFullYear()
    const q = Number(bareQ[1])
    const start = new Date(year, (q - 1) * 3, 1)
    const end = new Date(year, q * 3, 1)
    return t >= start.getTime() && t < end.getTime()
  }

  const qw = /^(\d{4})Q([1-4])$/i.exec(periodSpec)
  if (qw) {
    const year = Number(qw[1])
    const q = Number(qw[2])
    const start = new Date(year, (q - 1) * 3, 1)
    const end = new Date(year, q * 3, 1)
    return t >= start.getTime() && t < end.getTime()
  }

  const wk = /^(\d{4})W(\d{1,2})$/i.exec(periodSpec)
  if (wk) {
    const year = Number(wk[1])
    const week = Number(wk[2])
    const jan1 = new Date(year, 0, 1)
    const dayOfWeek = jan1.getDay()
    const thursday = new Date(year, 0, 1 + ((4 - dayOfWeek + 7) % 7))
    const weekStart = new Date(thursday.getTime() + (week - 1) * 7 * 86400000 - 3 * 86400000)
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)
    return t >= weekStart.getTime() && t < weekEnd.getTime()
  }

  const ym = /^(\d{4})(\d{2})$/.exec(periodSpec)
  if (ym) {
    const year = Number(ym[1])
    const month = Number(ym[2]) - 1
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 1)
    return t >= start.getTime() && t < end.getTime()
  }

  const m = /^(\d{2})$/.exec(periodSpec)
  if (m) {
    const year = now.getFullYear()
    const month = Number(m[1]) - 1
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 1)
    return t >= start.getTime() && t < end.getTime()
  }

  const y = /^(\d{4})$/.exec(periodSpec)
  if (y) {
    const year = Number(y[1])
    const start = new Date(year, 0, 1)
    const end = new Date(year + 1, 0, 1)
    return t >= start.getTime() && t < end.getTime()
  }

  return false
}

function matchDateKeyword(
  item: XitItem,
  kw: DateKeyword,
  offset?: number,
  now: Date = new Date(),
): boolean {
  if (kw === 'nodue') {
    return item.dueDate === null
  }

  // Overdue only applies to actionable items — exclude checked/obsolete.
  if (kw === 'overdue' && (item.status === 'checked' || item.status === 'obsolete')) {
    return false
  }

  const range = resolveDateKeyword(kw, offset, now)
  if (!range) return false

  if (!item.dueDate) return false
  const itemDate = parseDueDate(item.dueDate, now)
  if (!itemDate) return false

  const t = itemDate.getTime()
  return t >= range.start.getTime() && t < range.end.getTime()
}

function matchItem(item: XitItem, ast: QueryNode, now: Date = new Date()): boolean {
  switch (ast.type) {
    case 'and':
      return ast.children.every((child) => matchItem(item, child, now))
    case 'or':
      return ast.children.some((child) => matchItem(item, child, now))
    case 'not':
      return !matchItem(item, ast.child, now)
    case 'status':
      return item.status === ast.value
    case 'priority': {
      if (ast.op === 'any') return item.priority > 0
      const p = item.priority
      const v = ast.value!
      switch (ast.op) {
        case '=':
          return p === v
        case '>':
          return p > v
        case '>=':
          return p >= v
        case '<':
          return p < v
        case '<=':
          return p <= v
        default:
          return false
      }
    }
    case 'date':
      if (ast.op === '~') return matchDatePeriod(item, ast.value, ast.offset, now)
      return matchDate(item, ast.op, ast.value, ast.offset, now)
    case 'dateKeyword':
      return matchDateKeyword(item, ast.value, ast.offset, now)
    case 'tag':
      return item.tags.some(
        (t) => t.name === ast.name && (ast.value === undefined || t.value === ast.value),
      )
    case 'text': {
      if (!ast.value) return true
      const q = ast.value.toLowerCase()
      const descMatch = item.description.toLowerCase().includes(q)
      const tagMatch = item.tags.some(
        (t) => t.name.includes(q) || (t.value !== undefined && t.value.toLowerCase().includes(q)),
      )
      return descMatch || tagMatch
    }
    default:
      return true
  }
}

export function filterItems(lines: XitLine[], ast: QueryNode, now: Date = new Date()): XitLine[] {
  return lines.filter((line) => {
    if (line.type !== 'item') return false
    return matchItem(line, ast, now)
  })
}
