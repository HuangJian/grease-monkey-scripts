import type { XitItemStatus } from '../types'

export type QueryNode =
  | { type: 'and'; children: QueryNode[] }
  | { type: 'or'; children: QueryNode[] }
  | { type: 'not'; child: QueryNode }
  | { type: 'status'; value: XitItemStatus }
  | { type: 'priority'; op: '=' | '>' | '>=' | '<' | '<=' | 'any'; value?: number }
  | { type: 'date'; op: '>' | '<' | '>=' | '<=' | '=' | '~'; value: string; offset?: number }
  | {
      type: 'dateKeyword'
      value: DateKeyword
      offset?: number
    }
  | { type: 'tag'; name: string; value?: string }
  | { type: 'text'; value: string }

export type QueryResult = { ok: true; ast: QueryNode } | { ok: false; error: string }

export type TokenType =
  | 'STATUS'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'HASH'
  | 'BANG'
  | 'COMP'
  | 'TILDE'
  | 'DATE_KEYWORD'
  | 'NUMBER'
  | 'IDENT'
  | 'STRING'
  | 'EOF'

export type Token = { type: TokenType; value: string; pos: number }

export type DateKeyword =
  | 'today'
  | 'overdue'
  | 'nodue'
  | 'thisweek'
  | 'thismonth'
  | 'thisyear'
  | 'everyday'
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
