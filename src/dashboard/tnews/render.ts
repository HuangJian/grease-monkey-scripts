import type { Runtime } from '../../runtime'
import { formatRelativeTime } from '../overlay/card-chrome'
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

function buildItemHtml(item: TnewsItem, state: TnewsState, now: number): string {
  const expanded = state.isExpanded(item.id)
  const readClass = state.isRead(item.id) ? ' gm-sp-item-read' : ''
  const expandedClass = expanded ? ' gm-sp-list-item-expanded' : ''
  const timeText = relativeLabel(item.pubDate, now)
  const titleText = stripLeadingSymbols(item.title || '(无标题)')
  return `<li class="gm-sp-list-item${readClass}${expandedClass}" data-item-id="${escapeAttr(item.id)}">
    <span class="gm-sp-tnews-row">
      <button type="button" class="gm-sp-item-hide" aria-label="hide">×</button>
      <span class="gm-sp-tnews-time" title="${escapeAttr(TIME_LABEL_FMT.format(new Date(item.pubDate)))}">${escapeText(timeText)}</span>
      <span class="gm-sp-tnews-title" title="${escapeAttr(titleText)}">${escapeText(titleText)}</span>
    </span>
    <div class="gm-sp-tnews-body"${expanded ? '' : ' hidden'}>${item.descriptionHtml}</div>
  </li>`
}

function applyItemExpanded(li: HTMLElement, expanded: boolean): void {
  const body = li.querySelector<HTMLElement>('.gm-sp-tnews-body')
  if (!body) return
  body.hidden = !expanded
  li.classList.toggle('gm-sp-list-item-expanded', expanded)
}

function updateBadge(container: HTMLElement): void {
  const card = container.closest('.gm-sp-card')
  if (!card) return
  const badge = card.querySelector<HTMLElement>('.gm-sp-tab[data-tab-id="tnews"] .gm-sp-tab-badge')
  if (!badge) return
  const unread = container.querySelectorAll<HTMLElement>(
    '.gm-sp-list-item:not(.gm-sp-item-read)',
  ).length
  badge.textContent = String(unread)
  badge.hidden = unread === 0
}

export function renderTnews(
  container: HTMLElement,
  items: TnewsItem[] | null,
  state: TnewsState,
  runtime: Runtime | null,
  now: number,
): void {
  container.replaceChildren()
  if (!items || items.length === 0) {
    container.insertAdjacentHTML('beforeend', '<div class="gm-sp-empty">暂无数据</div>')
    return
  }
  const listHtml = items.map((it) => buildItemHtml(it, state, now)).join('')
  container.insertAdjacentHTML('beforeend', `<ol class="gm-sp-list">${listHtml}</ol>`)
  container.querySelectorAll<HTMLElement>('.gm-sp-list-item').forEach((li) => {
    const id = li.dataset['itemId']!
    const row = li.querySelector<HTMLElement>('.gm-sp-tnews-row')!
    const hideBtn = li.querySelector<HTMLButtonElement>('.gm-sp-item-hide')!
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.gm-sp-item-hide')) return
      state.markRead(id)
      li.classList.add('gm-sp-item-read')
      updateBadge(container)
      container.querySelectorAll<HTMLElement>('.gm-sp-list-item').forEach((otherLi) => {
        if (otherLi !== li) {
          const otherId = otherLi.dataset['itemId']!
          state.setExpanded(otherId, false)
          applyItemExpanded(otherLi, false)
        }
      })
      const expanded = state.toggleExpanded(id)
      applyItemExpanded(li, expanded)
    })
    hideBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      state.markHidden(id)
      li.remove()
      if (runtime) {
        void state.saveToStorage(runtime)
        void state.removeFromCache(runtime, id)
      }
    })
  })
}
