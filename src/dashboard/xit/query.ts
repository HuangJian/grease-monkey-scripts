import type { XitItem, XitItemStatus, XitLine } from './types'
import { parseDueDate } from './parser'

// ── AST types ──────────────────────────────────────────────────────────────

export type QueryNode =
  | { type: 'and'; children: QueryNode[] }
  | { type: 'or'; children: QueryNode[] }
  | { type: 'not'; child: QueryNode }
  | { type: 'status'; value: XitItemStatus }
  | { type: 'priority'; op: '=' | '>' | '>=' | '<' | '<=' | 'any'; value?: number }
  | { type: 'date'; op: '>' | '<' | '>=' | '<=' | '=' | '~'; value: string; offset?: number }
  | {
      type: 'dateKeyword'
      value: 'today' | 'overdue' | 'nodue' | 'thisweek' | 'thismonth' | 'thisyear'
      offset?: number
    }
  | { type: 'tag'; name: string; value?: string }
  | { type: 'text'; value: string }

export type QueryResult = { ok: true; ast: QueryNode } | { ok: false; error: string }

// ── Token types ────────────────────────────────────────────────────────────

type TokenType =
  | 'STATUS'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'HASH'
  | 'BANG'
  | 'COMP' // > < >= <= =
  | 'TILDE'
  | 'DATE_KEYWORD'
  | 'NUMBER'
  | 'IDENT'
  | 'STRING'
  | 'EOF'

type Token = { type: TokenType; value: string; pos: number }

// ── Tokenizer ──────────────────────────────────────────────────────────────

const STATUS_CHARS = new Map<string, XitItemStatus>([
  ['[ ]', 'open'],
  ['[]', 'open'],
  ['[x]', 'checked'],
  ['[@]', 'ongoing'],
  ['[~]', 'obsolete'],
  ['[?]', 'in-question'],
])

const KEYWORDS = new Set(['and', 'or', 'not'])

const DATE_KEYWORDS = new Set(['today', 'thisweek', 'thismonth', 'thisyear', 'overdue', 'nodue'])

const DATE_OFFSET_RE = /^(today|thisweek|thismonth|thisyear)([+-]\d+)$/

// Period specs: 2026Q3, 2026W23, 202606, 06, 2026
const PERIOD_SPEC_RE = /^\d{4}[QqWw]\d{1,2}$|^\d{4}\d{2}$|^\d{2}$|^\d{4}$/

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let pos = 0

  while (pos < input.length) {
    // skip whitespace
    if (/\s/.test(input[pos]!)) {
      pos++
      continue
    }

    // string literal
    if (input[pos] === '"') {
      const start = pos
      pos++ // skip opening quote
      let value = ''
      while (pos < input.length && input[pos] !== '"') {
        value += input[pos]
        pos++
      }
      if (pos >= input.length) {
        return [{ type: 'STRING', value, pos: start }] // unterminated, will be caught by parser
      }
      pos++ // skip closing quote
      tokens.push({ type: 'STRING', value, pos: start })
      continue
    }

    // status tokens: [ ], [], [x], [@], [~], [?]
    if (input[pos] === '[') {
      const start = pos
      // try 3-char forms first
      if (pos + 2 < input.length) {
        const tri = input.slice(pos, pos + 3)
        if (STATUS_CHARS.has(tri)) {
          tokens.push({ type: 'STATUS', value: tri, pos: start })
          pos += 3
          continue
        }
      }
      // try [] (2 chars)
      if (pos + 1 < input.length && input[pos + 1] === ']') {
        tokens.push({ type: 'STATUS', value: '[]', pos: start })
        pos += 2
        continue
      }
      // not a recognized status, fall through to be treated as text
    }

    // hash for tags
    if (input[pos] === '#') {
      tokens.push({ type: 'HASH', value: '#', pos })
      pos++
      continue
    }

    // tilde for period operator
    if (input[pos] === '~') {
      tokens.push({ type: 'TILDE', value: '~', pos })
      pos++
      continue
    }

    // bang for priority
    if (input[pos] === '!') {
      tokens.push({ type: 'BANG', value: '!', pos })
      pos++
      continue
    }

    // comparison operators: >=, <=, >, <, =
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

    // parentheses
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

    // numbers (may be part of period spec like 2026Q3)
    if (/\d/.test(input[pos]!)) {
      const start = pos
      while (pos < input.length && /\d/.test(input[pos]!)) {
        pos++
      }
      // Check if this is a period spec like 2026Q3 or 2026W23
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

    // identifiers and keywords (may include + - for date offsets)
    if (/[a-zA-Z\u4e00-\u9fa5_]/.test(input[pos]!)) {
      const start = pos
      while (pos < input.length && /[a-zA-Z0-9\u4e00-\u9fa5_+-]/.test(input[pos]!)) {
        pos++
      }
      const word = input.slice(start, pos)
      const lower = word.toLowerCase()

      // check for date keyword with offset: today+3, thisweek-1
      const offsetMatch = DATE_OFFSET_RE.exec(lower)
      if (offsetMatch) {
        const kw = offsetMatch[1]!
        const off = Number(offsetMatch[2])
        tokens.push({
          type: 'DATE_KEYWORD',
          value: `${kw}+${off >= 0 ? off : Math.abs(off)}`,
          pos: start,
        })
        // store actual offset in value encoding: "keyword+number" or "keyword-number"
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

    // unrecognized character, skip
    pos++
  }

  tokens.push({ type: 'EOF', value: '', pos })
  return tokens
}

// ── Parser ─────────────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token {
    return this.tokens[this.pos]!
  }

  private advance(): Token {
    const tok = this.tokens[this.pos]!
    this.pos++
    return tok
  }

  private expect(type: TokenType): Token {
    const tok = this.peek()
    if (tok.type !== type) {
      throw new Error(`Expected ${type}, got ${tok.type} at position ${tok.pos}`)
    }
    return this.advance()
  }

  parse(): QueryResult {
    try {
      const ast = this.parseOr()
      if (this.peek().type !== 'EOF') {
        return {
          ok: false,
          error: `Unexpected token "${this.peek().value}" at position ${this.peek().pos}`,
        }
      }
      return { ok: true, ast }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // orExpr → andExpr ('or' andExpr)*
  private parseOr(): QueryNode {
    const left = this.parseAnd()
    if (this.peek().type === 'OR') {
      this.advance()
      const right = this.parseOr()
      if (left.type === 'or') {
        return { type: 'or', children: [...left.children, right] }
      }
      return { type: 'or', children: [left, right] }
    }
    return left
  }

  // andExpr → unaryExpr+
  private parseAnd(): QueryNode {
    const children: QueryNode[] = [this.parseUnary()]
    while (
      this.peek().type !== 'OR' &&
      this.peek().type !== 'RPAREN' &&
      this.peek().type !== 'EOF'
    ) {
      // implicit AND: if next token can start a term, parse it
      if (this.peek().type === 'AND') {
        this.advance() // consume explicit 'and'
      }
      children.push(this.parseUnary())
    }
    return children.length === 1 ? children[0]! : { type: 'and', children }
  }

  // unaryExpr → 'not' unaryExpr | primaryExpr
  private parseUnary(): QueryNode {
    if (this.peek().type === 'NOT') {
      this.advance()
      const child = this.parseUnary()
      return { type: 'not', child }
    }
    return this.parsePrimary()
  }

  // primaryExpr → '(' orExpr ')' | term
  private parsePrimary(): QueryNode {
    if (this.peek().type === 'LPAREN') {
      this.advance()
      const ast = this.parseOr()
      this.expect('RPAREN')
      return ast
    }
    return this.parseTerm()
  }

  // term → statusTerm | priorityTerm | dateCompTerm | dateKeywordTerm | tagTerm | textTerm
  private parseTerm(): QueryNode {
    const tok = this.peek()

    switch (tok.type) {
      case 'STATUS':
        return this.parseStatus()
      case 'BANG':
        return this.parsePriority()
      case 'TILDE':
        return this.parseDatePeriod()
      case 'COMP':
        return this.parseDateComp()
      case 'DATE_KEYWORD':
        return this.parseDateKeyword()
      case 'HASH':
        return this.parseTag()
      case 'STRING':
        this.advance()
        return { type: 'text', value: tok.value }
      case 'IDENT':
        this.advance()
        return { type: 'text', value: tok.value.toLowerCase() }
      case 'NUMBER':
        this.advance()
        return { type: 'text', value: tok.value }
      default:
        throw new Error(`Unexpected token "${tok.value}" at position ${tok.pos}`)
    }
  }

  private parseStatus(): QueryNode {
    const tok = this.expect('STATUS')
    const value = STATUS_CHARS.get(tok.value)
    if (!value) {
      throw new Error(`Unknown status "${tok.value}" at position ${tok.pos}`)
    }
    return { type: 'status', value }
  }

  private parsePriority(): QueryNode {
    this.expect('BANG')
    const tok = this.peek()

    if (tok.type === 'NUMBER') {
      this.advance()
      return { type: 'priority', op: '=', value: Number(tok.value) }
    }

    if (tok.type === 'COMP') {
      this.advance()
      const num = this.expect('NUMBER')
      return {
        type: 'priority',
        op: tok.value as '>' | '>=' | '<' | '<=',
        value: Number(num.value),
      }
    }

    // bare ! = has any priority (must be followed by space, ), or EOF)
    if (tok.type === 'AND' || tok.type === 'OR' || tok.type === 'RPAREN' || tok.type === 'EOF') {
      return { type: 'priority', op: 'any' }
    }

    // ! followed by non-number/non-operator is an error
    throw new Error(`! must be followed by a number or comparison operator at position ${tok.pos}`)
  }

  private parseDateComp(): QueryNode {
    const opTok = this.advance() // COMP token
    const valTok = this.peek()

    if (valTok.type === 'DATE_KEYWORD') {
      this.advance()
      const kw = this.parseDateKeywordValue(valTok.value)
      return { type: 'dateKeyword', ...kw, offset: kw.offset }
    }

    // date value: digits
    if (valTok.type === 'NUMBER' || valTok.type === 'IDENT') {
      this.advance()
      return { type: 'date', op: opTok.value as '>' | '<' | '>=' | '<=' | '=', value: valTok.value }
    }

    throw new Error(`Expected date value after "${opTok.value}" at position ${opTok.pos}`)
  }

  private parseDatePeriod(): QueryNode {
    this.expect('TILDE')
    const tok = this.peek()

    if (tok.type === 'DATE_KEYWORD') {
      this.advance()
      const kw = this.parseDateKeywordValue(tok.value)
      return { type: 'date', op: '~', value: kw.value, offset: kw.offset }
    }

    if (tok.type === 'NUMBER' || tok.type === 'IDENT') {
      this.advance()
      return { type: 'date', op: '~', value: tok.value }
    }

    throw new Error(`Expected date value after "~" at position ${tok.pos}`)
  }

  private parseDateKeyword(): QueryNode {
    const tok = this.advance()
    const kw = this.parseDateKeywordValue(tok.value)
    return { type: 'dateKeyword', ...kw }
  }

  private parseDateKeywordValue(raw: string): {
    value: 'today' | 'overdue' | 'nodue' | 'thisweek' | 'thismonth' | 'thisyear'
    offset?: number
  } {
    const match = /^(today|thisweek|thismonth|thisyear|overdue|nodue)([+-]\d+)?$/.exec(raw)
    if (!match) {
      throw new Error(`Unknown date keyword "${raw}"`)
    }
    const value = match[1]! as 'today' | 'overdue' | 'nodue' | 'thisweek' | 'thismonth' | 'thisyear'
    const offset = match[2] ? Number(match[2]) : undefined
    return { value, offset }
  }

  private parseTag(): QueryNode {
    this.expect('HASH')
    const nameTok = this.expect('IDENT')
    const name = nameTok.value.toLowerCase()

    if (this.peek().type === 'COMP' && this.peek().value === '=') {
      this.advance() // consume =
      const valTok = this.peek()
      if (valTok.type === 'STRING') {
        this.advance()
        return { type: 'tag', name, value: valTok.value }
      }
      if (valTok.type === 'IDENT' || valTok.type === 'NUMBER') {
        this.advance()
        return { type: 'tag', name, value: valTok.value }
      }
      throw new Error(`Expected tag value after "=" at position ${this.peek().pos}`)
    }

    return { type: 'tag', name }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

function validateNoMultipleStatusInAnd(node: QueryNode): string | null {
  if (node.type === 'and') {
    const statusCount = node.children.filter((c) => c.type === 'status').length
    if (statusCount > 1) {
      return 'Only one status term allowed (use OR for multiple statuses)'
    }
    for (const child of node.children) {
      const err = validateNoMultipleStatusInAnd(child)
      if (err) return err
    }
  }
  if (node.type === 'or') {
    for (const child of node.children) {
      const err = validateNoMultipleStatusInAnd(child)
      if (err) return err
    }
  }
  if (node.type === 'not') {
    return validateNoMultipleStatusInAnd(node.child)
  }
  return null
}

export function parseQuery(input: string): QueryResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: true, ast: { type: 'text', value: '' } } // empty query matches all
  }
  const tokens = tokenize(trimmed)
  const parser = new Parser(tokens)
  const result = parser.parse()
  if (!result.ok) return result

  const err = validateNoMultipleStatusInAnd(result.ast)
  if (err) return { ok: false, error: err }

  return result
}

// ── Evaluator ──────────────────────────────────────────────────────────────

function getTodayStart(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000)
}

function addWeeks(date: Date, n: number): Date {
  return addDays(date, n * 7)
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, date.getDate())
}

function addYears(date: Date, n: number): Date {
  return new Date(date.getFullYear() + n, date.getMonth(), date.getDate())
}

function resolveDateKeyword(
  kw: 'today' | 'overdue' | 'nodue' | 'thisweek' | 'thismonth' | 'thisyear',
  offset?: number,
): { start: Date; end: Date } | null {
  const today = getTodayStart()

  switch (kw) {
    case 'today': {
      const d = offset ? addDays(today, offset) : today
      return { start: d, end: addDays(d, 1) }
    }
    case 'thisweek': {
      const dayOfWeek = today.getDay() // 0=Sun
      const weekStart = addDays(today, -dayOfWeek)
      const base = offset ? addWeeks(weekStart, offset) : weekStart
      return { start: base, end: addDays(base, 7) }
    }
    case 'thismonth': {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const base = offset ? addMonths(monthStart, offset) : monthStart
      const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 1)
      return { start: base, end: monthEnd }
    }
    case 'thisyear': {
      const yearStart = new Date(today.getFullYear(), 0, 1)
      const base = offset ? addYears(yearStart, offset) : yearStart
      const yearEnd = new Date(base.getFullYear() + 1, 0, 1)
      return { start: base, end: yearEnd }
    }
    case 'overdue': {
      return { start: new Date(0), end: today }
    }
    case 'nodue': {
      return null // special case: handled separately
    }
  }
}

function parseDateValue(value: string): Date | null {
  // YYYYMMDD
  if (/^\d{8}$/.test(value)) {
    const y = Number(value.slice(0, 4))
    const m = Number(value.slice(4, 6)) - 1
    const d = Number(value.slice(6, 8))
    return new Date(y, m, d)
  }
  // MMDD (4 digits)
  if (/^\d{4}$/.test(value)) {
    const year = new Date().getFullYear()
    const m = Number(value.slice(0, 2)) - 1
    const d = Number(value.slice(2, 4))
    return new Date(year, m, d)
  }
  // YYYY
  if (/^\d{4}$/.test(value)) {
    const y = Number(value)
    return new Date(y, 11, 31) // end of year
  }
  // delegate to xit parser for YYYY-MM-DD, YYYY-MM, YYYY-Qx, YYYY-Wx
  return parseDueDate(value)
}

function matchDate(item: XitItem, op: string, value: string): boolean {
  if (!item.dueDate) return false
  const itemDate = parseDueDate(item.dueDate)
  if (!itemDate) return false
  const targetDate = parseDateValue(value)
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

function matchDatePeriod(item: XitItem, periodSpec: string, offset?: number): boolean {
  if (!item.dueDate) return false
  const itemDate = parseDueDate(item.dueDate)
  if (!itemDate) return false

  const t = itemDate.getTime()

  // Handle date keywords with offset: ~thisweek+1, ~thismonth-1
  if (['today', 'thisweek', 'thismonth', 'thisyear'].includes(periodSpec)) {
    const range = resolveDateKeyword(
      periodSpec as 'today' | 'thisweek' | 'thismonth' | 'thisyear',
      offset,
    )
    if (!range) return false
    return t >= range.start.getTime() && t < range.end.getTime()
  }

  // parse period spec: YYYYQx, YYYYWxx, YYYYMM, YYYY, MM
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
    const year = new Date().getFullYear()
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
  kw: 'today' | 'overdue' | 'nodue' | 'thisweek' | 'thismonth' | 'thisyear',
  offset?: number,
): boolean {
  if (kw === 'nodue') {
    return item.dueDate === null
  }

  const range = resolveDateKeyword(kw, offset)
  if (!range) return false

  if (!item.dueDate) return false
  const itemDate = parseDueDate(item.dueDate)
  if (!itemDate) return false

  const t = itemDate.getTime()
  return t >= range.start.getTime() && t < range.end.getTime()
}

function matchItem(item: XitItem, ast: QueryNode): boolean {
  switch (ast.type) {
    case 'and':
      return ast.children.every((child) => matchItem(item, child))
    case 'or':
      return ast.children.some((child) => matchItem(item, child))
    case 'not':
      return !matchItem(item, ast.child)
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
      if (ast.op === '~') return matchDatePeriod(item, ast.value, ast.offset)
      return matchDate(item, ast.op, ast.value)
    case 'dateKeyword':
      return matchDateKeyword(item, ast.value, ast.offset)
    case 'tag':
      return item.tags.some(
        (t) => t.name === ast.name && (ast.value === undefined || t.value === ast.value),
      )
    case 'text': {
      if (!ast.value) return true // empty text matches all
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

export function filterItems(lines: XitLine[], ast: QueryNode): XitLine[] {
  return lines.filter((line) => {
    if (line.type !== 'item') return false
    return matchItem(line, ast)
  })
}
