/**
 * Shared expandable/collapsible topic list component.
 *
 * Used by tnews, xueqiu news (list), and xueqiu hotspots. Each source
 * provides render functions for title, body, actions, and optional extra
 * content (e.g. reply/like stats). The component handles list structure,
 * time display, and scroll-into-view behaviour.
 *
 * Scroll behaviour: when toggling expand/collapse, the row is scrolled into
 * view only if its title is NOT already visible in the scroll container.
 * The parent calls `scrollIfNeeded(id)` before mutating state; the
 * `useLayoutEffect` inside the hook performs the actual scroll after the
 * DOM updates.
 */
import { useLayoutEffect, useRef } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { escapeHtml } from '../../utils'
import { formatTopicTime, isElementInScrollContainer, type TimeFormat } from './expandable-utils'

// ---------------------------------------------------------------------------
// useExpandScroll — scroll-into-view hook
// ---------------------------------------------------------------------------

const DEFAULT_SELECTOR = (id: string): string =>
  `li[data-item-id="${CSS.escape(id)}"] .gm-sp-expandable-row`

export type ExpandScrollApi = {
  /** Ref shared with the layout-effect that performs the scroll. */
  scrollTargetRef: { current: string | null }
  /**
   * Call before toggling expand/collapse. If the row title is not visible
   * in its scroll container, queues a scroll for the next layout effect.
   */
  scrollIfNeeded: (id: string) => void
}

/**
 * Create a scroll controller for expandable lists.
 *
 * @param root         ShadowRoot or element to query for the row element.
 * @param selectorFn   Returns a CSS selector for the row element given an item id.
 */
export function useExpandScroll(
  root: ShadowRoot | HTMLElement,
  selectorFn: (id: string) => string = DEFAULT_SELECTOR,
): ExpandScrollApi {
  const scrollTargetRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const id = scrollTargetRef.current
    if (!id) return
    scrollTargetRef.current = null
    const el = root.querySelector(selectorFn(id))
    el?.scrollIntoView({ block: 'start', behavior: 'auto' })
  })

  function scrollIfNeeded(id: string): void {
    const el = root.querySelector(selectorFn(id))
    if (el && !isElementInScrollContainer(el as HTMLElement)) {
      scrollTargetRef.current = id
    }
  }

  return { scrollTargetRef, scrollIfNeeded }
}

// ---------------------------------------------------------------------------
// ExpandableList — list renderer
// ---------------------------------------------------------------------------

export type ExpandableListProps<T> = {
  items: T[]
  getItemId: (item: T) => string
  isExpanded: (id: string) => boolean
  isRead?: (id: string) => boolean
  isHidden?: (id: string) => boolean
  onRowClick: (item: T) => void
  /** Returns the timestamp for the time label, or undefined to hide it. */
  getTime: (item: T) => number | undefined
  timeFormat: TimeFormat
  /** Returns tooltip text for the time label. */
  timeTitle?: (item: T) => string | undefined
  /** Renders the title content (placed inside `.gm-sp-expandable-title`). */
  renderTitle: (item: T) => ComponentChildren
  /** Returns tooltip text for the title span (optional). */
  titleAttr?: (item: T) => string | undefined
  /** Renders the expanded body content (placed inside `.gm-sp-expandable-body`). */
  renderBody: (item: T) => ComponentChildren
  /** Renders action buttons (bulk-read, hide) — typically `<ItemActions />`. */
  renderActions?: (item: T) => ComponentChildren
  /** Renders extra content in the row (e.g. reply/like stats for hot mode). */
  renderExtra?: (item: T) => ComponentChildren
  containerClassName: string
  emptyMessage?: string
  /** ARIA role for the clickable row (default: none). */
  rowRole?: string
  /** tabindex for the clickable row (default: none). */
  rowTabIndex?: number
}

export function ExpandableList<T>({
  items,
  getItemId,
  isExpanded,
  isRead,
  isHidden,
  onRowClick,
  getTime,
  timeFormat,
  timeTitle,
  renderTitle,
  titleAttr,
  renderBody,
  renderActions,
  renderExtra,
  containerClassName,
  emptyMessage = '暂无数据',
  rowRole,
  rowTabIndex,
}: ExpandableListProps<T>) {
  if (items.length === 0) {
    return (
      <div class={containerClassName}>
        <div class="gm-sp-empty">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div class={containerClassName}>
      <ol class="gm-sp-list">
        {items.map((item) => {
          const id = getItemId(item)
          if (isHidden?.(id)) return null
          const expanded = isExpanded(id)
          const read = isRead?.(id) ?? false
          const readClass = read ? ' gm-sp-item-read' : ''
          const expandedClass = expanded ? ' gm-sp-list-item-expanded' : ''
          const time = getTime(item)
          const rowProps: Record<string, unknown> = {
            class: 'gm-sp-expandable-row',
            onClick: () => onRowClick(item),
          }
          if (rowRole) rowProps.role = rowRole
          if (rowTabIndex !== undefined) rowProps.tabindex = rowTabIndex

          return (
            <li
              key={id}
              class={`gm-sp-list-item${readClass}${expandedClass}`}
              data-item-id={escapeHtml(id)}
            >
              <span {...rowProps}>
                {time !== undefined && (
                  <span class="gm-sp-expandable-time" title={timeTitle?.(item)}>
                    {formatTopicTime(time, timeFormat)}
                  </span>
                )}
                <span class="gm-sp-expandable-title" title={titleAttr?.(item)}>
                  {renderTitle(item)}
                </span>
                {renderExtra?.(item)}
              </span>
              {renderActions?.(item)}
              {expanded && <div class="gm-sp-expandable-body">{renderBody(item)}</div>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
