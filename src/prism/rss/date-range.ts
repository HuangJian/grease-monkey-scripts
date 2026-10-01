/**
 * The reader's long-window filter: a handful of presets instead of two date
 * pickers.
 *
 * Picking two dates was the one control in the card that asked the reader to do
 * arithmetic ("which day was last Tuesday?") to answer a question they never had
 * in that form — they always wanted "this week" or "the last ten days".
 *
 * Deliberately **not** merged into the shared `DateFilter` (全/今/昨/前/早): those
 * are the buttons the reader reaches for when they want *yesterday*, and they
 * belong to every source. These presets are longer windows only the reader
 * offers, and the two compose — the buttons narrow by day, this narrows by
 * window. Widening `DateFilter` would have put these options in every other
 * source's bar.
 */
export const DATE_RANGE_OPTIONS = ['全部', '本周', '近十天', '近三十天', '三十天以前'] as const

export type DateRangePreset = (typeof DATE_RANGE_OPTIONS)[number]

/** No window: what the reader sees until one is picked. */
export const ALL_DATES: DateRangePreset = '全部'

export function isDateRangeActive(range: DateRangePreset): boolean {
  return range !== ALL_DATES
}

/**
 * Local midnight `days` days before the day `now` falls in.
 *
 * Stepping the calendar (`setDate`) rather than subtracting milliseconds keeps
 * the result on a real midnight across DST changes, where `midnight - n * 24h`
 * lands an hour off and would move an entry across the window's edge.
 */
function midnightDaysAgo(now: number, days: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.getTime()
}

/** Monday 00:00 local of the week `now` falls in — weeks start on Monday. */
function weekStart(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  // getDay() is Sunday-first; shift so Monday is 0.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/**
 * Half-open bounds for a preset, or null for 全部.
 *
 * Every bound is a local midnight — the same calendar-day grid the timeline's
 * sections and the 今/昨/前/早 buttons use — so nothing in one control can
 * contradict the other. Counts are calendar days: 近十天 is today plus the nine
 * days before it, which is what "近十天" means to a reader and what makes the
 * section headings line up with the filter.
 *
 * Windows are open at the top. There is no future to keep out, and an upper
 * bound would silently drop entries whose feed timestamp runs ahead of this
 * machine's clock.
 *
 * 近三十天 and 三十天以前 are exact complements — one starts at the midnight the
 * other ends at — so switching between them cannot lose an entry or show it twice.
 */
export function dateRangeBounds(
  range: DateRangePreset,
  now: number,
): { start?: number; end?: number } | null {
  switch (range) {
    case '全部':
      return null
    case '本周':
      return { start: weekStart(now) }
    case '近十天':
      return { start: midnightDaysAgo(now, 9) }
    case '近三十天':
      return { start: midnightDaysAgo(now, 29) }
    case '三十天以前':
      return { end: midnightDaysAgo(now, 29) }
  }
}

/**
 * Keeps the entries published inside the preset window.
 *
 * `getCreated` decides what an entry's date *is*; the RSS reader hands it
 * `placedAt`, so an entry with no publish date arrives as "now" and is judged
 * like any other recent entry.
 */
export function applyDateRange<T>(
  items: T[],
  range: DateRangePreset,
  getCreated: (item: T) => number,
  now: number,
): T[] {
  const bounds = dateRangeBounds(range, now)
  if (!bounds) return items
  return items.filter((item) => {
    const created = getCreated(item)
    if (bounds.start !== undefined && created < bounds.start) return false
    if (bounds.end !== undefined && created >= bounds.end) return false
    return true
  })
}
