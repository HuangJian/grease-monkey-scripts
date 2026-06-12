import type { XitItemStatus } from '../types'
import type { Token } from './types'

export const STATUS_CHARS = new Map<string, XitItemStatus>([
  ['[ ]', 'open'],
  ['[]', 'open'],
  ['[x]', 'checked'],
  ['[@]', 'ongoing'],
  ['[~]', 'obsolete'],
  ['[?]', 'in-question'],
])

const KEYWORDS = new Set(['and', 'or', 'not'])

const DATE_KEYWORDS = new Set([
  'today',
  'thisweek',
  'thismonth',
  'thisyear',
  'overdue',
  'nodue',
  'everyday',
])

const DATE_OFFSET_RE = /^(today|thisweek|thismonth|thisyear)([+-]\d+)$/

const PERIOD_SPEC_RE = /^\d{4}[QqWw]\d{1,2}$|^\d{4}\d{2}$|^\d{2}$|^\d{4}$/

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let pos = 0

  while (pos < input.length) {
    if (/\s/.test(input[pos]!)) {
      pos++
      continue
    }

    if (input[pos] === '"') {
      const start = pos
      pos++
      let value = ''
      while (pos < input.length && input[pos] !== '"') {
        value += input[pos]
        pos++
      }
      if (pos >= input.length) {
        return [{ type: 'STRING', value, pos: start }]
      }
      pos++
      tokens.push({ type: 'STRING', value, pos: start })
      continue
    }

    if (input[pos] === '[') {
      const start = pos
      if (pos + 2 < input.length) {
        const tri = input.slice(pos, pos + 3)
        if (STATUS_CHARS.has(tri)) {
          tokens.push({ type: 'STATUS', value: tri, pos: start })
          pos += 3
          continue
        }
      }
      if (pos + 1 < input.length && input[pos + 1] === ']') {
        tokens.push({ type: 'STATUS', value: '[]', pos: start })
        pos += 2
        continue
      }
    }

    if (input[pos] === '#') {
      tokens.push({ type: 'HASH', value: '#', pos })
      pos++
      continue
    }

    if (input[pos] === '~') {
      tokens.push({ type: 'TILDE', value: '~', pos })
      pos++
      continue
    }

    if (input[pos] === '!') {
      tokens.push({ type: 'BANG', value: '!', pos })
      pos++
      continue
    }

    if (input[pos] === '>' || input[pos] === '<' || input[pos] === '=') {
      const start = pos
      pos++
      if (pos < input.length && input[pos] === '=') {
        pos++
        tokens.push({ type: 'COMP', value: input.slice(start, pos), pos: start })
      } else {
        tokens.push({ type: 'COMP', value: input[start]!, pos: start })
      }
      continue
    }

    if (input[pos] === '(') {
      tokens.push({ type: 'LPAREN', value: '(', pos })
      pos++
      continue
    }
    if (input[pos] === ')') {
      tokens.push({ type: 'RPAREN', value: ')', pos })
      pos++
      continue
    }

    if (/\d/.test(input[pos]!)) {
      const start = pos
      while (pos < input.length && /\d/.test(input[pos]!)) {
        pos++
      }
      if (pos < input.length && /[QqWw]/.test(input[pos]!)) {
        pos++
        while (pos < input.length && /\d/.test(input[pos]!)) {
          pos++
        }
        const periodSpec = input.slice(start, pos)
        if (PERIOD_SPEC_RE.test(periodSpec)) {
          tokens.push({ type: 'IDENT', value: periodSpec, pos: start })
          continue
        }
      }
      tokens.push({ type: 'NUMBER', value: input.slice(start, pos), pos: start })
      continue
    }

    if (/[a-zA-Z\u4e00-\u9fa5_]/.test(input[pos]!)) {
      const start = pos
      while (pos < input.length && /[a-zA-Z0-9\u4e00-\u9fa5_+-]/.test(input[pos]!)) {
        pos++
      }
      const word = input.slice(start, pos)
      const lower = word.toLowerCase()

      const offsetMatch = DATE_OFFSET_RE.exec(lower)
      if (offsetMatch) {
        const kw = offsetMatch[1]!
        const off = Number(offsetMatch[2])
        tokens.push({
          type: 'DATE_KEYWORD',
          value: `${kw}+${off >= 0 ? off : Math.abs(off)}`,
          pos: start,
        })
        tokens[tokens.length - 1]!.value = lower
        continue
      }

      if (DATE_KEYWORDS.has(lower)) {
        tokens.push({ type: 'DATE_KEYWORD', value: lower, pos: start })
      } else if (KEYWORDS.has(lower)) {
        tokens.push({ type: lower.toUpperCase() as 'AND' | 'OR' | 'NOT', value: lower, pos: start })
      } else {
        tokens.push({ type: 'IDENT', value: word, pos: start })
      }
      continue
    }

    pos++
  }

  tokens.push({ type: 'EOF', value: '', pos })
  return tokens
}
