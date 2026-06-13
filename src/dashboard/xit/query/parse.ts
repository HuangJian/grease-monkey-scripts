import type { Token, TokenType, QueryNode, QueryResult, DateKeyword } from './types'
import { tokenize, STATUS_CHARS } from './tokenize'
import { validateNoMultipleStatusInAnd } from './validate'

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

  private parseAnd(): QueryNode {
    const children: QueryNode[] = [this.parseUnary()]
    while (
      this.peek().type !== 'OR' &&
      this.peek().type !== 'RPAREN' &&
      this.peek().type !== 'EOF'
    ) {
      if (this.peek().type === 'AND') {
        this.advance()
      }
      children.push(this.parseUnary())
    }
    return children.length === 1 ? children[0]! : { type: 'and', children }
  }

  private parseUnary(): QueryNode {
    if (this.peek().type === 'NOT') {
      this.advance()
      const child = this.parseUnary()
      return { type: 'not', child }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): QueryNode {
    if (this.peek().type === 'LPAREN') {
      this.advance()
      const ast = this.parseOr()
      this.expect('RPAREN')
      return ast
    }
    return this.parseTerm()
  }

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

    if (tok.type === 'AND' || tok.type === 'OR' || tok.type === 'RPAREN' || tok.type === 'EOF') {
      return { type: 'priority', op: 'any' }
    }

    throw new Error(`! must be followed by a number or comparison operator at position ${tok.pos}`)
  }

  private parseDateComp(): QueryNode {
    const opTok = this.advance()
    const valTok = this.peek()

    if (valTok.type === 'DATE_KEYWORD') {
      this.advance()
      const kw = this.parseDateKeywordValue(valTok.value)
      return {
        type: 'date',
        op: opTok.value as '>' | '<' | '>=' | '<=' | '=',
        value: kw.value,
        offset: kw.offset,
      }
    }

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

  private parseDateKeywordValue(raw: string): { value: DateKeyword; offset?: number } {
    const match =
      /^(today|thisweek|thismonth|thisyear|overdue|nodue|everyday|sunday|monday|tuesday|wednesday|thursday|friday|saturday)([+-]\d+)?$/.exec(
        raw,
      )
    if (!match) {
      throw new Error(`Unknown date keyword "${raw}"`)
    }
    const value = match[1]! as DateKeyword
    const offset = match[2] ? Number(match[2]) : undefined
    return { value, offset }
  }

  private parseTag(): QueryNode {
    this.expect('HASH')
    const nameTok = this.expect('IDENT')
    const name = nameTok.value.toLowerCase()

    if (this.peek().type === 'COMP' && this.peek().value === '=') {
      this.advance()
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

export function parseQuery(input: string): QueryResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: true, ast: { type: 'text', value: '' } }
  }
  const tokens = tokenize(trimmed)
  const parser = new Parser(tokens)
  const result = parser.parse()
  if (!result.ok) return result

  const err = validateNoMultipleStatusInAnd(result.ast)
  if (err) return { ok: false, error: err }

  return result
}
