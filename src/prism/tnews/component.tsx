import { useReducer } from 'preact/hooks'
import { ItemActions } from '../card/primitives'
import { createItemHandlers } from '../item-actions'
import { ExpandableList, useExpandScroll } from '../shared/expandable-list'
import type { SourceComponentProps } from '../types'
import type { TnewsState } from './state'
import type { TnewsItem } from './types'

const FULL_TIME_FMT = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

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
  root,
  state,
  onNotify: notify,
}: TnewsComponentProps) {
  const [, forceRender] = useReducer<number, void>((n) => n + 1, 0)
  const { scrollIfNeeded } = useExpandScroll(root)

  const items = data ?? []

  function handleRowClick(item: TnewsItem) {
    scrollIfNeeded(item.id)
    state.markRead(item.id)
    items.forEach((other) => {
      if (other.id !== item.id) {
        state.setExpanded(other.id, false)
      }
    })
    state.toggleExpanded(item.id)
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

  return (
    <ExpandableList
      items={items}
      getItemId={(item) => item.id}
      isExpanded={(id) => state.isExpanded(id)}
      isRead={(id) => state.isRead(id)}
      isHidden={(id) => state.isHidden(id)}
      onRowClick={handleRowClick}
      getTime={(item) => item.pubDate}
      timeFormat="date-time"
      timeTitle={(item) => FULL_TIME_FMT.format(new Date(item.pubDate))}
      titleAttr={(item) => stripLeadingSymbols(item.title || '(无标题)')}
      renderTitle={(item) => stripLeadingSymbols(item.title || '(无标题)')}
      renderBody={(item) => (
        <div dangerouslySetInnerHTML={{ __html: stripImgSizeAttrs(item.descriptionHtml) }} />
      )}
      renderActions={(item) => (
        <ItemActions onBulkRead={() => handleBulkRead(item)} onHide={() => handleHide(item.id)} />
      )}
      containerClassName="gm-sp-tnews"
    />
  )
}
