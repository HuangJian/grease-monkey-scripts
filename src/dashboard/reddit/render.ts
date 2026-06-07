import { escapeHtml, escapeUrl } from '../../utils'
import type { RedditState } from './state'
import type { RedditPost } from './types'

export function renderReddit(
  container: HTMLElement,
  data: RedditPost[] | null,
  state: RedditState,
): void {
  container.replaceChildren()
  if (!data || data.length === 0) {
    container.insertAdjacentHTML('beforeend', '<div class="gm-sp-empty">暂无数据</div>')
    return
  }
  const listHtml = data
    .map((post) => {
      const readClass = state.isRead(post.id) ? ' gm-sp-reddit-read' : ''
      const hiddenClass = state.isHidden(post.id) ? ' gm-sp-reddit-hidden-marker' : ''
      const titleHtml = `<a class="gm-sp-reddit-title" href="${escapeUrl(post.url)}" target="_blank"
        rel="noopener noreferrer">${escapeHtml(post.title)}</a>`
      const subText = escapeHtml(post.subreddits.map((s) => `r/${s}`).join(', '))
      return `<li class="gm-sp-reddit-item${readClass}${hiddenClass}" data-post-id="${post.id}">
        <span class="gm-sp-reddit-count" title="得分">${post.score}</span>
        ${titleHtml}
        <span class="gm-sp-reddit-meta">
          <span class="gm-sp-reddit-sub">${subText}</span>
          <span class="gm-sp-reddit-comments" title="评论数">💬 ${post.numComments}</span>
        </span>
        <button class="gm-sp-reddit-hide" title="隐藏该主题">×</button>
      </li>`
    })
    .join('')
  container.insertAdjacentHTML('beforeend', `<ol class="gm-sp-reddit-list">${listHtml}</ol>`)
  container.querySelectorAll<HTMLElement>('.gm-sp-reddit-item').forEach((item) => {
    const postId = item.dataset['postId']!
    const link = item.querySelector('.gm-sp-reddit-title') as HTMLAnchorElement
    link.addEventListener('click', () => {
      state.markRead(postId)
      item.classList.add('gm-sp-reddit-read')
    })
    const hideBtn = item.querySelector('.gm-sp-reddit-hide') as HTMLButtonElement
    hideBtn.addEventListener('click', (e) => {
      e.preventDefault()
      state.markHidden(postId)
      item.remove()
    })
  })
}
