import type { ComponentChildren } from 'preact'

export const DATE_OPTIONS = ['全', '今', '昨', '前', '早', '未'] as const

export type DateFilter = (typeof DATE_OPTIONS)[number]

export function dateFilterBounds(
  filter: DateFilter,
  now: number,
): { start?: number; end?: number } | null {
  if (filter === '全') return null
  const d = new Date(now)
  const ts = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
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
  trailing?: ComponentChildren
}

export function DateFilterGroup({ value, onChange, trailing }: DateFilterGroupProps) {
  return (
    <div class="gm-sp-date-filter">
      {DATE_OPTIONS.map((opt) => (
        <button
          type="button"
          class={`gm-sp-date-filter-btn${value === opt ? ' gm-sp-date-filter-btn-active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
      {trailing}
    </div>
  )
}
