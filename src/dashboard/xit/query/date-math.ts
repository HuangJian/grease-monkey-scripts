import { parseDueDate } from '../parser'

export function getTodayStart(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(date: Date, n: number): Date {
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

export function resolveDateKeyword(
  kw: 'today' | 'overdue' | 'nodue' | 'thisweek' | 'thismonth' | 'thisyear' | 'everyday',
  offset?: number,
): { start: Date; end: Date } | null {
  const today = getTodayStart()

  switch (kw) {
    case 'today':
    case 'everyday': {
      const d = offset ? addDays(today, offset) : today
      return { start: d, end: addDays(d, 1) }
    }
    case 'thisweek': {
      const dayOfWeek = today.getDay()
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
      return null
    }
  }
}

export function parseDateValue(value: string): Date | null {
  if (/^\d{8}$/.test(value)) {
    const y = Number(value.slice(0, 4))
    const m = Number(value.slice(4, 6)) - 1
    const d = Number(value.slice(6, 8))
    return new Date(y, m, d)
  }
  if (/^\d{4}$/.test(value)) {
    const year = new Date().getFullYear()
    const m = Number(value.slice(0, 2)) - 1
    const d = Number(value.slice(2, 4))
    return new Date(year, m, d)
  }
  if (/^\d{4}$/.test(value)) {
    const y = Number(value)
    return new Date(y, 11, 31)
  }
  return parseDueDate(value)
}
