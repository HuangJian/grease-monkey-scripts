/**
 * Date / time label parsing for the prism dashboard.
 *
 * Three label parsers used to live scattered across feature modules. They are
 * collected here as the single owner of "human label -> timestamp/date string"
 * so every date convention is auditable in one place. They are kept as
 * SEPARATE functions on purpose — see the warnings below — because unifying
 * them would silently change one source's behavior.
 *
 * - `parseRelativeTime` (from hupu): China-site relative labels ("X分钟前") and
 *   absolute `YYYY-MM-DD HH:MM` / `MM-DD HH:MM`, pinned to +08:00. It does NOT
 *   roll a month-day that lands in the future back to the prior year.
 * - `parseChapterLabel` (from novels): chapter labels. Local timezone, and a
 *   month-day that would be in the future is rolled back a year (a chapter
 *   dated "tomorrow" is a typo, not next year). A future-date roll-back here is
 *   load-bearing — `test/prism/novels/adapters/sudugu.test.ts` asserts
 *   `12-25` -> previous year.
 * - `parseDateLabelToStr` (from weather CMA): `M/D` -> `YYYY-MM-DD` string for
 *   the daily forecast array, which is keyed by date strings, not timestamps.
 *
 * Do NOT merge `parseRelativeTime` and `parseChapterLabel` into one function:
 * the +08:00-vs-local split and the year-roll-back split are both intentional
 * and tested. Resolve them together only with a conscious, behavior-flagged
 * decision.
 */

/** Milliseconds at local midnight for the given timestamp. */
export function startOfDay(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Current calendar year in the local timezone. */
export function currentYear(now: number = Date.now()): number {
  return new Date(now).getFullYear()
}

/**
 * Parse a hupu relative-time label into a Unix ms timestamp.
 *
 * Relative labels ("X分钟前" / "X小时前" / "X天前") are offsets from `now`.
 * Absolute labels (`YYYY-MM-DD HH:MM`, `MM-DD HH:MM`) are interpreted as China
 * wall-clock time (+08:00). Returns `now` when the label matches nothing, so an
 * unparseable post timestamp defaults to "just now" rather than 0 (which would
 * make it expire immediately under retention pruning).
 */
export function parseRelativeTime(text: string, now: number): number {
  if (!text) return now
  const minuteMatch = text.match(/(\d+)\s*分钟前/)
  if (minuteMatch) return now - Number(minuteMatch[1]) * 60_000
  const hourMatch = text.match(/(\d+)\s*小时前/)
  if (hourMatch) return now - Number(hourMatch[1]) * 3_600_000
  const dayMatch = text.match(/(\d+)\s*天前/)
  if (dayMatch) return now - Number(dayMatch[1]) * 86_400_000
  const fullMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
  if (fullMatch) {
    const [, y, m, d, h, min] = fullMatch
    const ts = new Date(`${y}-${m}-${d}T${h}:${min}:00+08:00`).getTime()
    if (Number.isFinite(ts) && ts > 0) return ts
  }
  const mdMatch = text.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
  if (mdMatch) {
    const [, m, d, h, min] = mdMatch
    const year = new Date(now).getFullYear()
    const ts = new Date(`${year}-${m}-${d}T${h}:${min}:00+08:00`).getTime()
    if (Number.isFinite(ts) && ts > 0) return ts
  }
  return now
}

/**
 * Parse a novels chapter-label into a Unix ms timestamp.
 *
 * Supports 今天 / 昨天 / YYYY-M-D / M-D / H:MM. Local timezone. A month-day that
 * would land in the future is rolled back to the previous year (a chapter
 * labeled with a future date is treated as a typo for last year). Returns
 * undefined when the label matches nothing; callers map undefined -> 0.
 */
export function parseChapterLabel(text: string, now: number = Date.now()): number | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const nowDate = new Date(now)

  if (trimmed === '今天') return startOfDay(now)
  if (trimmed === '昨天') {
    const d = new Date(startOfDay(now))
    d.setDate(d.getDate() - 1)
    return d.getTime()
  }

  const fullDate = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  if (fullDate) {
    const [, y, m, d] = fullDate
    return new Date(Number(y), Number(m) - 1, Number(d)).getTime()
  }

  const monthDay = /^(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  if (monthDay) {
    const [, m, d] = monthDay
    const year = nowDate.getFullYear()
    const candidate = new Date(year, Number(m) - 1, Number(d))
    if (candidate.getTime() > now) {
      candidate.setFullYear(year - 1)
    }
    return candidate.getTime()
  }

  const hourMinute = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (hourMinute) {
    const [, h, m] = hourMinute
    const d = new Date(startOfDay(now))
    d.setHours(Number(h), Number(m), 0, 0)
    return d.getTime()
  }

  return undefined
}

/**
 * Parse a `M/D` or `M-D` date label into a `YYYY-MM-DD` string using the
 * current year. Used by weather CMA daily parsing, where the day array is keyed
 * by date strings rather than timestamps. Returns undefined when the label is
 * not a plausible month/day.
 */
export function parseDateLabelToStr(text: string, now: number): string | undefined {
  const m = text.match(/(\d{1,2})\D(\d{1,2})/)
  if (!m) return undefined
  const month = Number(m[1])
  const day = Number(m[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const y = currentYear(now)
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
