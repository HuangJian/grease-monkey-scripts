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

function buildItemHtml(item: TnewsItem, state: TnewsState, now: number): string {
  const expanded = state.isExpanded(item.id)
  const readClass = state.isRead(item.id) ? ' gm-sp-tnews-read' : ''
  const expandedClass = expanded ? ' gm-sp-tnews-item-expanded' : ''
  const chevronChar = expanded ? '▾' : '▸'
  const timeText = relativeLabel(item.pubDate, now)
  const titleText = item.title || '(无标题)'
  return `<li class="gm-sp-tnews-item${readClass}${expandedClass}" data-item-id="${escapeAttr(item.id)}">
    <span class="gm-sp-tnews-row">
      <button type="button" class="gm-sp-tnews-chevron" aria-label="toggle expand">${chevronChar}</button>
      <a class="gm-sp-tnews-title" href="${escapeAttr(item.link)}">${escapeText(titleText)}</a>
      <span class="gm-sp-tnews-time" title="${escapeAttr(TIME_LABEL_FMT.format(new Date(item.pubDate)))}">${escapeText(timeText)}</span>
      <button type="button" class="gm-sp-tnews-hide" aria-label="hide">×</button>
    </span>
    <div class="gm-sp-tnews-body"${expanded ? '' : ' hidden'}>${item.descriptionHtml}</div>
  </li>`
}

function applyItemExpanded(li: HTMLElement, expanded: boolean): void {
  const chevron = li.querySelector<HTMLElement>('.gm-sp-tnews-chevron')
  const body = li.querySelector<HTMLElement>('.gm-sp-tnews-body')
  if (!chevron || !body) return
  chevron.textContent = expanded ? '▾' : '▸'
  body.hidden = !expanded
  li.classList.toggle('gm-sp-tnews-item-expanded', expanded)
}

export function renderTnews(
  container: HTMLElement,
  items: TnewsItem[] | null,
  state: TnewsState,
  runtime: Runtime,
  now: number,
): void {
  container.replaceChildren()
  if (!items || items.length === 0) {
    container.insertAdjacentHTML('beforeend', '<div class="gm-sp-empty">暂无数据</div>')
    return
  }
  const listHtml = items.map((it) => buildItemHtml(it, state, now)).join('')
  container.insertAdjacentHTML('beforeend', `<ol class="gm-sp-tnews-list">${listHtml}</ol>`)
  container.querySelectorAll<HTMLElement>('.gm-sp-tnews-item').forEach((li) => {
    const id = li.dataset['itemId']!
    const chevron = li.querySelector<HTMLButtonElement>('.gm-sp-tnews-chevron')!
    const title = li.querySelector<HTMLAnchorElement>('.gm-sp-tnews-title')!
    const hideBtn = li.querySelector<HTMLButtonElement>('.gm-sp-tnews-hide')!
    chevron.addEventListener('click', (e) => {
      e.preventDefault()
      const expanded = state.toggleExpanded(id)
      applyItemExpanded(li, expanded)
    })
    title.addEventListener('click', (e) => {
      const mod = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
      if (!mod && e.button === 0) {
        e.preventDefault()
        state.markRead(id)
        const expanded = state.toggleExpanded(id)
        li.classList.add('gm-sp-tnews-read')
        applyItemExpanded(li, expanded)
      }
    })
    hideBtn.addEventListener('click', (e) => {
      e.preventDefault()
      state.markHidden(id)
      li.remove()
      void state.removeFromCache(runtime, id)
    })
  })
}
