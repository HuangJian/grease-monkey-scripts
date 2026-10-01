import type { ComponentChildren } from 'preact'

export const DATE_OPTIONS = ['全', '今', '昨', '前', '早'] as const

export type DateFilter = (typeof DATE_OPTIONS)[number]

/** Local midnight for a timestamp — the shared basis of every date judgment here. */
function localMidnight(ts: number): number {
  const d = new Date(ts)
  // 使用浏览器本地时区计算日期边界
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function dateFilterBounds(
  filter: DateFilter,
  now: number,
): { start?: number; end?: number } | null {
  if (filter === '全') return null
  const ts = localMidnight(now)
  switch (filter) {
    case '今':
      return { start: ts }
    case '昨':
      return { start: ts - 86400000, end: ts }
    case '前':
      return { start: ts - 172800000, end: ts - 86400000 }
    case '早':
      return { end: ts - 172800000 }
    default:
      return null
  }
}

export const DAY_SECTIONS = ['today', 'yesterday', 'earlier'] as const

export type DaySection = (typeof DAY_SECTIONS)[number]

export const DAY_SECTION_LABELS: Record<DaySection, string> = {
  today: '今天',
  yesterday: '昨天',
  earlier: '更早',
}

/**
 * The date an item is filtered and grouped by: a missing timestamp counts as
 * **now**.
 *
 * One function, because every date judgment has to agree — grouping puts an
 * undated entry in 今天, so the pills must keep it under 今 and the 起–止 window
 * must keep it in a window that covers today. Deciding "missing" separately in
 * each place is how you get an entry that is in 今天 under 全 and gone under 今.
 *
 * Calling it "unknown" instead would only be honest on paper: there is nothing
 * the reader can do with "we do not know", and a section of its own collects
 * exactly the entries nobody can act on. The reader's place for an entry it
 * cannot date is next to the ones it has just seen.
 */
export function placedAt(ts: number, now: number): number {
  return ts === 0 ? now : ts
}

/**
 * Which day section a timestamp belongs to, on the same local-midnight basis as
 * `dateFilterBounds` — a timeline grouped by this and filtered by 今/昨/早 agree
 * with each other, which they would not if each used its own notion of "today".
 *
 * Undated entries (`0`) land in 今天 through `placedAt`.
 */
export function daySectionOf(ts: number, now: number): DaySection {
  const at = placedAt(ts, now)
  const today = localMidnight(now)
  if (at >= today) return 'today'
  if (at >= today - 86_400_000) return 'yesterday'
  return 'earlier'
}

export type DateFilterGroupProps = {
  value: DateFilter
  onChange: (filter: DateFilter) => void
  filterUnread?: boolean
  onToggleFilterUnread?: () => void
  trailing?: ComponentChildren
}

export function DateFilterGroup({
  value,
  onChange,
  filterUnread,
  onToggleFilterUnread,
  trailing,
}: DateFilterGroupProps) {
  return (
    <div class="gm-sp-date-filter">
      {DATE_OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          class={`gm-sp-date-filter-btn${value === opt ? ' gm-sp-date-filter-btn-active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
      {filterUnread !== undefined && onToggleFilterUnread && (
        <label class="gm-sp-date-filter-unread" title="勾选后滤去已读">
          <input type="checkbox" checked={filterUnread} onChange={onToggleFilterUnread} />未
        </label>
      )}
      {trailing}
    </div>
  )
}
