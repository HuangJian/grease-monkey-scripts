import type { Runtime } from '../../runtime'
import { parseXitText, isWeekdayName } from './parser'
import type { XitItem } from './types'

const LAST_RESET_KEY = 'dashboard:v2:xit-last-reset'

/**
 * Returns a date string in YYYY-MM-DD format (local time).
 */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Returns the Monday-anchored date for the week containing `d`.
 * Week runs Monday → Sunday.
 */
export function weekKey(d: Date): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayOfWeek = date.getDay() || 7 // Sunday → 7
  const monday = new Date(date.getTime() - (dayOfWeek - 1) * 86_400_000)
  return dateKey(monday)
}

/** Parses a YYYY-MM-DD string into a local Date. */
function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export type RecurringResetResult = {
  text: string
  lastResetDate: string
  changed: boolean
}

/**
 * Unchecks `[x]` items with `-> everyday` (on day change) or `-> weekday`
 * (on week change). Pure function — no I/O.
 *
 * @param text          The full xit text.
 * @param lastResetDate The last reset date as YYYY-MM-DD, or null on first run.
 * @param now           The current date/time.
 */
export function applyRecurringReset(
  text: string,
  lastResetDate: string | null,
  now: Date,
): RecurringResetResult {
  const todayKey = dateKey(now)

  // First run: record today's date, don't reset anything.
  if (!lastResetDate) {
    return { text, lastResetDate: todayKey, changed: false }
  }

  const shouldResetDaily = lastResetDate !== todayKey
  const shouldResetWeekly = weekKey(parseDateKey(lastResetDate)) !== weekKey(now)

  if (!shouldResetDaily && !shouldResetWeekly) {
    return { text, lastResetDate: todayKey, changed: false }
  }

  const lines = parseXitText(text)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const textLines = text.split(/\r?\n/)
  let changed = false

  for (const line of lines) {
    if (line.type !== 'item') continue
    const item = line as XitItem
    if (item.status !== 'checked') continue
    if (!item.dueDate) continue

    const shouldReset =
      (shouldResetDaily && item.dueDate === 'everyday') ||
      (shouldResetWeekly && isWeekdayName(item.dueDate))

    if (!shouldReset) continue

    const raw = textLines[item.lineIndex]
    if (raw !== undefined) {
      textLines[item.lineIndex] = raw.replace(/^\[x\]/, '[ ]')
      changed = true
    }
  }

  return {
    text: changed ? textLines.join(eol) : text,
    lastResetDate: todayKey,
    changed,
  }
}

/**
 * Loads the last-reset date from storage, applies the recurring reset,
 * and persists the updated last-reset date. Returns the (possibly modified) text.
 */
export async function resetRecurringTasks(runtime: Runtime, text: string): Promise<string> {
  const lastReset = await runtime.getValue<string | null>(LAST_RESET_KEY, null)
  const result = applyRecurringReset(text, lastReset, new Date())
  if (result.lastResetDate !== lastReset) {
    await runtime.setValue(LAST_RESET_KEY, result.lastResetDate)
  }
  return result.text
}

export { LAST_RESET_KEY }
