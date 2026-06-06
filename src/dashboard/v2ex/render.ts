import type { Runtime } from '../../runtime'
import { htmlToElement } from '../../utils'
import type { V2exState } from './state'
import type { V2exTopic } from './types'

const SOURCE_BADGES = {
  cross: { icon: '🔥', title: '双源确认热帖' },
  page: { icon: '🌅', title: '今天发布的热帖' },
  api: { icon: '⏳', title: 'API 抓取或历史热帖' },
} as const

function sourceBadge(topic: V2exTopic): { icon: string; title: string } | null {
  const sources = topic.sources
  const isFromApi = sources?.includes('api') ?? false
  const isFromPage = sources?.includes('page') ?? false
  if (isFromApi && isFromPage) return SOURCE_BADGES.cross
  if (isFromPage) return SOURCE_BADGES.page
  if (isFromApi) return SOURCE_BADGES.api
  return null
}

function buildTopicItem(
  document: Document,
  topic: V2exTopic,
  state: V2exState,
  runtime: Runtime | null,
): HTMLLIElement {
  const item = htmlToElement<HTMLLIElement>(
    document,
    `<li class="gm-sp-v2ex-item">
      <span class="gm-sp-v2ex-source"></span>
      <span class="gm-sp-v2ex-count" title="回复数"></span>
      <a class="gm-sp-v2ex-title" target="_blank" rel="noopener noreferrer"></a>
      <span class="gm-sp-v2ex-meta">
        <span class="gm-sp-v2ex-node"></span>
        <span class="gm-sp-v2ex-author"></span>
      </span>
    </li>`,
  )
  const countEl = item.querySelector('.gm-sp-v2ex-count') as HTMLSpanElement
  countEl.textContent = String(topic.replies)
  const link = item.querySelector('.gm-sp-v2ex-title') as HTMLAnchorElement
  link.href = topic.url
  link.textContent = topic.title
  item.querySelector('.gm-sp-v2ex-node')!.textContent = topic.node.title
  item.querySelector('.gm-sp-v2ex-author')!.textContent = topic.member.username
    ? `@${topic.member.username}`
    : ''
  const sourceEl = item.querySelector('.gm-sp-v2ex-source') as HTMLSpanElement
  const badge = sourceBadge(topic)
  if (badge) {
    sourceEl.textContent = badge.icon
    sourceEl.title = badge.title
  }
  if (state.isRead(topic.id)) {
    item.classList.add('gm-sp-v2ex-read')
  }
  link.addEventListener('click', () => {
    state.markRead(topic.id)
    item.classList.add('gm-sp-v2ex-read')
  })
  const hideBtn = htmlToElement<HTMLButtonElement>(
    document,
    '<button class="gm-sp-v2ex-hide" title="隐藏该主题">×</button>',
  )
  hideBtn.addEventListener('click', (e) => {
    e.preventDefault()
    state.markHidden(topic.id)
    item.remove()
    if (runtime) {
      void state.saveToStorage(runtime)
      void state.removeFromCache(runtime, topic.id)
    }
  })
  item.appendChild(hideBtn)
  return item
}

export function renderV2ex(
  container: HTMLElement,
  data: V2exTopic[] | null,
  state: V2exState,
  runtime: Runtime | null,
): void {
  const document = container.ownerDocument
  container.replaceChildren()
  const visible = data ? state.filterVisible(data) : null
  if (!visible || visible.length === 0) {
    const empty = htmlToElement<HTMLDivElement>(document, '<div class="gm-sp-empty">暂无数据</div>')
    container.appendChild(empty)
    return
  }
  const list = htmlToElement<HTMLOListElement>(document, '<ol class="gm-sp-v2ex-list"></ol>')
  for (const topic of visible) {
    list.appendChild(buildTopicItem(document, topic, state, runtime))
  }
  container.appendChild(list)
}
