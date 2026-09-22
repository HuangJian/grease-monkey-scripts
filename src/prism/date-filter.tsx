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

export const DAY_SECTIONS = ['today', 'yesterday', 'earlier', 'unknown'] as const

export type DaySection = (typeof DAY_SECTIONS)[number]

export const DAY_SECTION_LABELS: Record<DaySection, string> = {
  today: '今天',
  yesterday: '昨天',
  earlier: '更早',
  unknown: '未知日期',
}

/**
 * Which day section a timestamp belongs to, on the same local-midnight basis as
 * `dateFilterBounds` — a timeline grouped by this and filtered by 今/昨/早 agree
 * with each other, which they would not if each used its own notion of "today".
 *
 * `unknown` is for entries with no timestamp at all (legal in RSS): they are not
 * "earlier", they are undated, and calling them earlier would be a lie.
 */
export function daySectionOf(ts: number, now: number): DaySection {
  if (!ts) return 'unknown'
  const today = localMidnight(now)
  if (ts >= today) return 'today'
  if (ts >= today - 86_400_000) return 'yesterday'
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
