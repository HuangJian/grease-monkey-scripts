import { parseDueDate } from '../parser'

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

  const soonEnd = new Date(todayEnd.getTime() + 3 * 24 * 3600 * 1000)

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

export function formatDueDateDisplay(dateStr: string): string {
  if (dateStr === 'everyday') return 'everyday'
  const currentYear = new Date().getFullYear()
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (ymd) {
    return Number(ymd[1]) === currentYear ? `${ymd[2]}-${ymd[3]}` : dateStr
  }
  const ym = /^(\d{4})-(\d{2})$/.exec(dateStr)
  if (ym) {
    return Number(ym[1]) === currentYear ? `M${Number(ym[2])}` : dateStr
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
