import type { ComponentChildren } from 'preact'

export const DATE_OPTIONS = ['全', '今', '昨', '前', '早'] as const

export type DateFilter = (typeof DATE_OPTIONS)[number]

export function dateFilterBounds(
  filter: DateFilter,
  now: number,
): { start?: number; end?: number } | null {
  if (filter === '全') return null
  const d = new Date(now)
  // 使用浏览器本地时区计算日期边界
  const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
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
