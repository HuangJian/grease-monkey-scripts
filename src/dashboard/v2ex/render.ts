import type { Runtime } from '../../runtime'
import { escapeHtml, escapeUrl } from '../../utils'
import type { V2exState } from './state'
import type { V2exTopic } from './types'

function formatReplyCount(current: number, readReplies: number | undefined): string {
  if (readReplies === undefined) return `${current}`
  if (current <= readReplies) return `${current}`
  return `${readReplies} + ${current - readReplies}`
}

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

function buildTopicItemHtml(topic: V2exTopic, state: V2exState): string {
  const badge = sourceBadge(topic)
  const sourceAttrs = badge ? ` title="${badge.title}"` : ''
  const readClass = state.isRead(topic.id) ? ' gm-sp-item-read' : ''
  const titleHtml = `<a class="gm-sp-item-title" href="${escapeUrl(topic.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(topic.title)}</a>`
  const authorText = topic.member.username ? `@${escapeHtml(topic.member.username)}` : ''
  const replyCount = formatReplyCount(topic.replies, state.getReadReplies(topic.id))
  return `<li class="gm-sp-list-item gm-sp-list-item-flex${readClass}" data-topic-id="${topic.id}" data-replies="${topic.replies}">
      <span class="gm-sp-v2ex-source"${sourceAttrs}>${badge?.icon ?? ''}</span>
      <span class="gm-sp-item-count" title="回复数">${replyCount}</span>
      ${titleHtml}
      <span class="gm-sp-item-meta">
        <span class="gm-sp-v2ex-node">${escapeHtml(topic.node.title)}</span>
        <span class="gm-sp-v2ex-author">${authorText}</span>
      </span>
      <button class="gm-sp-item-hide" title="隐藏该主题">×</button>
    </li>`
}

export function renderV2ex(
  container: HTMLElement,
  data: V2exTopic[] | null,
  state: V2exState,
  runtime: Runtime | null,
): void {
  container.replaceChildren()
  const visible = data ? state.filterVisible(data) : null
  if (!visible || visible.length === 0) {
    container.insertAdjacentHTML('beforeend', '<div class="gm-sp-empty">暂无数据</div>')
    return
  }
  const listHtml = visible.map((t) => buildTopicItemHtml(t, state)).join('')
  container.insertAdjacentHTML('beforeend', `<ol class="gm-sp-list">${listHtml}</ol>`)
  container.querySelectorAll<HTMLElement>('.gm-sp-list-item').forEach((item) => {
    const topicId = Number(item.dataset['topicId']!)
    const replies = Number(item.dataset['replies']!)
    const link = item.querySelector('.gm-sp-item-title') as HTMLAnchorElement
    link.addEventListener('click', () => {
      state.markRead(topicId, Date.now(), replies)
      item.classList.add('gm-sp-item-read')
      if (runtime) void state.saveToStorage(runtime)
    })
    const hideBtn = item.querySelector('.gm-sp-item-hide') as HTMLButtonElement
    hideBtn.addEventListener('click', (e) => {
      e.preventDefault()
      state.markHidden(topicId)
      item.remove()
      if (runtime) {
        void state.saveToStorage(runtime)
        void state.removeFromCache(runtime, topicId)
      }
    })
  })
}
