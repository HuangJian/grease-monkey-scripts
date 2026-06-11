import { escapeHtml, escapeUrl } from '../../utils'
import { COLLAPSE_THRESHOLD, type ExpandCollapse } from './expand-collapse'
import type { RedditState } from './state'
import type { RedditPost } from './types'
import type { RedditRenderData } from './source'
import type { Runtime } from '../../runtime'

function formatCommentCount(current: number, readReplies: number | undefined): string {
  if (readReplies === undefined) return `${current}`
  if (current <= readReplies) return `${current}`
  return `${readReplies}+${current - readReplies}`
}

function sourceBadge(created: number): { icon: string; title: string } {
  const now = Date.now()
  const isToday = new Date(created).toDateString() === new Date(now).toDateString()
  return isToday ? { icon: '🌅', title: '今日主题' } : { icon: '⏳', title: '历史主题' }
}

function buildItemHtml(post: RedditPost, state: RedditState): string {
  const readClass = state.isRead(post.id) ? ' gm-sp-item-read' : ''
  const badge = sourceBadge(post.created)
  const titleHtml = `<a class="gm-sp-item-title" href="${escapeUrl(post.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a>`
  const commentCount = formatCommentCount(post.numComments, state.getReadReplies(post.id))
  return `<li class="gm-sp-list-item gm-sp-list-item-flex${readClass}" data-post-id="${post.id}" data-num-comments="${post.numComments}">
        <span class="gm-sp-reddit-source" title="${badge.title}">${badge.icon}</span>
        <span class="gm-sp-item-count" title="评论数">${commentCount}</span>
        ${titleHtml}
        <span class="gm-sp-reddit-score" title="得分">${post.score}</span>
        <button class="gm-sp-item-hide" title="隐藏该主题">×</button>
      </li>`
}

export function renderReddit(
  container: HTMLElement,
  data: RedditRenderData | null,
  state: RedditState,
  runtime: Runtime | null,
  expandCollapse: ExpandCollapse,
): void {
  container.replaceChildren()
  if (!data || Object.keys(data).length === 0) {
    container.insertAdjacentHTML('beforeend', '<div class="gm-sp-empty">暂无数据</div>')
    return
  }
  const allSubs = Object.keys(data)
  let totalPosts = 0
  for (const posts of Object.values(data)) totalPosts += posts.length
  const active = expandCollapse.activeSubs(allSubs, totalPosts)
  const showCaret = totalPosts > COLLAPSE_THRESHOLD

  const sectionsHtml = allSubs
    .map((sub) => {
      const visiblePosts = state.filterVisible(data[sub] ?? [])
      if (visiblePosts.length === 0) return ''
      const isActive = active.has(sub)
      const collapsedClass = isActive ? '' : ' gm-sp-reddit-section-collapsed'
      const caretClass = showCaret ? ' gm-sp-reddit-caret-visible' : ''
      const listHtml = visiblePosts.map((p) => buildItemHtml(p, state)).join('')
      return `<section class="gm-sp-reddit-section${collapsedClass}" data-sub="${escapeHtml(sub)}">
        <h3 class="gm-sp-reddit-sub-title" data-sub="${escapeHtml(sub)}">
          <span class="gm-sp-reddit-caret${caretClass}">▾</span>
          r/${escapeHtml(sub)}
          <button type="button" class="gm-sp-reddit-mark-all-read">全部已读</button>
        </h3>
        <ol class="gm-sp-list">${listHtml}</ol>
      </section>`
    })
    .join('')
  container.insertAdjacentHTML('beforeend', sectionsHtml)

  container.querySelectorAll<HTMLElement>('.gm-sp-reddit-section').forEach((section) => {
    const sub = section.dataset['sub']!
    section.querySelectorAll<HTMLElement>('.gm-sp-list-item').forEach((item) => {
      const postId = item.dataset['postId']!
      const numComments = Number(item.dataset['numComments']!)
      const link = item.querySelector('.gm-sp-item-title') as HTMLAnchorElement
      link.addEventListener('click', () => {
        state.markRead(postId, Date.now(), numComments)
        item.classList.add('gm-sp-item-read')
        if (runtime) void state.saveToStorage(runtime)
      })
      const hideBtn = item.querySelector('.gm-sp-item-hide') as HTMLButtonElement
      hideBtn.addEventListener('click', (e) => {
        e.preventDefault()
        state.markHidden(postId)
        item.remove()
        if (runtime) {
          void state.saveToStorage(runtime)
          void state.removeFromCache(runtime, postId)
          void state.removeFromHistory(runtime, postId)
        }
      })
    })
    // Mark-all-read button
    const markAllBtn = section.querySelector('.gm-sp-reddit-mark-all-read') as HTMLButtonElement
    markAllBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const now = Date.now()
      section.querySelectorAll<HTMLElement>('.gm-sp-list-item').forEach((item) => {
        const postId = item.dataset['postId']
        if (!postId || state.isRead(postId)) return
        const numComments = Number(item.dataset['numComments'] ?? 0)
        state.markRead(postId, now, numComments)
        item.classList.add('gm-sp-item-read')
      })
      if (runtime) void state.saveToStorage(runtime)
    })

    if (showCaret) {
      const titleEl = section.querySelector('.gm-sp-reddit-sub-title') as HTMLElement
      titleEl.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.gm-sp-reddit-mark-all-read')) return
        expandCollapse.toggleSub(sub, totalPosts)
        const newActive = expandCollapse.activeSubs(allSubs, totalPosts)
        container.querySelectorAll<HTMLElement>('.gm-sp-reddit-section').forEach((s) => {
          const ds = s.dataset['sub']!
          s.classList.toggle('gm-sp-reddit-section-collapsed', !newActive.has(ds))
        })
      })
    }
  })
}
