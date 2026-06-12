import { useState } from 'preact/hooks'
import { formatRelativeTime } from '../card/chrome'
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

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
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
  const [, forceUpdate] = useState(0)

  const items = data ?? []

  function handleRowClick(item: TnewsItem) {
    state.markRead(item.id)

    for (const other of items) {
      if (other.id !== item.id) {
        state.setExpanded(other.id, false)
      }
    }
    state.toggleExpanded(item.id)
    if (runtime) void state.saveToStorage(runtime)
    notify?.()
    forceUpdate((n) => n + 1)
  }

  function handleHide(item: TnewsItem) {
    state.markHidden(item.id)
    if (runtime) {
      void state.saveToStorage(runtime)
      void state.removeFromCache(runtime, item.id)
    }
    forceUpdate((n) => n + 1)
  }

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
          const readClass = state.isRead(item.id) ? ' gm-sp-item-read' : ''
          const expandedClass = expanded ? ' gm-sp-list-item-expanded' : ''
          const timeText = relativeLabel(item.pubDate, now)
          const titleText = stripLeadingSymbols(item.title || '(无标题)')
          return (
            <li
              class={`gm-sp-list-item${readClass}${expandedClass}`}
              data-item-id={escapeAttr(item.id)}
            >
              <span class="gm-sp-tnews-row" onClick={() => handleRowClick(item)}>
                <span
                  class="gm-sp-tnews-time"
                  title={escapeAttr(TIME_LABEL_FMT.format(new Date(item.pubDate)))}
                >
                  {escapeText(timeText)}
                </span>
                <span class="gm-sp-tnews-title" title={escapeAttr(titleText)}>
                  {escapeText(titleText)}
                </span>
                <button
                  type="button"
                  class="gm-sp-item-hide"
                  aria-label="hide"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleHide(item)
                  }}
                >
                  ×
                </button>
              </span>
              {expanded && (
                <div
                  class="gm-sp-tnews-body"
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
