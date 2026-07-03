import { useLayoutEffect, useRef, useReducer } from 'preact/hooks'
import { escapeHtml } from '../../utils'
import { formatRelativeTime, ItemActions } from '../card/primitives'
import { createItemHandlers } from '../item-actions'
import type { SourceComponentProps } from '../types'
import type { TnewsState } from './state'
import type { TnewsItem } from './types'

const TIME_LABEL_FMT = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function relativeLabel(pubDate: number, now: number): string {
  const formatted = formatRelativeTime(pubDate, now)
  if (formatted === '从未更新') return TIME_LABEL_FMT.format(new Date(pubDate))
  return formatted
}

function stripLeadingSymbols(s: string): string {
  return s.replace(/^[\p{S}\p{M}]+/u, '')
}

function stripImgSizeAttrs(html: string): string {
  return html.replace(/\s+(?:width|height)="[^"]*"/gi, '')
}

export type TnewsComponentProps = SourceComponentProps<TnewsItem[]> & {
  state: TnewsState
  now: number
}

export function TnewsComponent({
  data,
  runtime,
  state,
  now,
  onNotify: notify,
}: TnewsComponentProps) {
  const [, forceRender] = useReducer<number, void>((n) => n + 1, 0)
  const scrollTargetRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const id = scrollTargetRef.current
    if (!id) return
    scrollTargetRef.current = null
    const el = runtime.document.querySelector(
      `li[data-item-id="${CSS.escape(id)}"] .gm-sp-expandable-row`,
    )
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  })

  const items = data ?? []

  function handleRowClick(item: TnewsItem) {
    const wasExpanded = state.isExpanded(item.id)
    state.markRead(item.id)

    items.forEach((other) => {
      if (other.id !== item.id) {
        state.setExpanded(other.id, false)
      }
    })
    state.toggleExpanded(item.id)
    if (!wasExpanded) {
      scrollTargetRef.current = item.id
    }
    void state.saveToStorage(runtime)
    notify?.()
    forceRender()
  }

  const visible = items.filter((it) => !state.isHidden(it.id))

  const { handleHide, handleBulkRead } = createItemHandlers<TnewsItem>({
    state,
    runtime,
    forceUpdate: () => forceRender(),
    getVisible: () => visible,
    repliesOf: () => undefined,
  })

  if (items.length === 0) {
    return (
      <div class="gm-sp-tnews">
        <div class="gm-sp-empty">暂无数据</div>
      </div>
    )
  }

  return (
    <div class="gm-sp-tnews">
      <ol class="gm-sp-list">
        {items.map((item) => {
          if (state.isHidden(item.id)) return null
          const expanded = state.isExpanded(item.id)
          const read = state.isRead(item.id)
          const readClass = read ? ' gm-sp-item-read' : ''
          const expandedClass = expanded ? ' gm-sp-list-item-expanded' : ''
          const timeText = relativeLabel(item.pubDate, now)
          const titleText = stripLeadingSymbols(item.title || '(无标题)')
          return (
            <li
              key={item.id}
              class={`gm-sp-list-item${readClass}${expandedClass}`}
              data-item-id={escapeHtml(item.id)}
            >
              <span class="gm-sp-expandable-row" onClick={() => handleRowClick(item)}>
                <span
                  class="gm-sp-expandable-time"
                  title={escapeHtml(TIME_LABEL_FMT.format(new Date(item.pubDate)))}
                >
                  {escapeHtml(timeText)}
                </span>
                <span class="gm-sp-expandable-title" title={escapeHtml(titleText)}>
                  {escapeHtml(titleText)}
                </span>
              </span>
              <ItemActions
                onBulkRead={() => handleBulkRead(item)}
                onHide={() => handleHide(item.id)}
              />
              {expanded && (
                <div
                  class="gm-sp-expandable-body"
                  dangerouslySetInnerHTML={{ __html: stripImgSizeAttrs(item.descriptionHtml) }}
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
