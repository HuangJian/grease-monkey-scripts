import type { Source } from '../sources/types'
import type { CachedSource } from '../types'
import { htmlToElement } from '../../utils'
import { isVeryStale } from '../cache'

export type CardOptions<T> = {
  source: Source<T>
  cached: CachedSource<T> | null
  ttlMs: number
  now: number
  onRefresh: () => void
}

export function renderHeader(modal: HTMLElement, options: { onClose: () => void }): void {
  const document = modal.ownerDocument
  const header = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-header">
      <div class="gm-sp-title">个人仪表盘</div>
      <button type="button" class="gm-sp-close" aria-label="close">×</button>
    </div>`,
  )
  header.querySelector('.gm-sp-close')!.addEventListener('click', options.onClose)
  modal.appendChild(header)
}

export function renderCard<T>(container: HTMLElement, options: CardOptions<T>): void {
  const { source, cached, ttlMs, now, onRefresh } = options
  const document = container.ownerDocument
  const veryStale = isVeryStale(cached, ttlMs, now)
  container.replaceChildren()
  container.dataset['source'] = source.id

  const header = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-card-header">
      <div class="gm-sp-card-title">
        <span class="gm-sp-card-title-text"></span>
      </div>
      <div class="gm-sp-card-actions">
        <span class="gm-sp-card-updated"></span>
        <button type="button" class="gm-sp-refresh" aria-label="refresh">↻</button>
      </div>
    </div>`,
  )
  header.querySelector('.gm-sp-card-title-text')!.textContent = source.title
  if (veryStale) {
    const badge = htmlToElement<HTMLSpanElement>(
      document,
      '<span class="gm-sp-card-stale">数据陈旧</span>',
    )
    header.querySelector('.gm-sp-card-title')!.appendChild(badge)
  }
  const updated = header.querySelector('.gm-sp-card-updated')!
  updated.textContent = formatRelativeTime(cached?.fetchedAt ?? null, now)
  const refresh = header.querySelector('.gm-sp-refresh') as HTMLButtonElement
  refresh.addEventListener('click', () => {
    refresh.disabled = true
    onRefresh()
    setTimeout(() => {
      refresh.disabled = false
    }, 800)
  })
  container.appendChild(header)

  const errorEl = document.createElement('div')
  errorEl.className = 'gm-sp-card-error'
  if (cached?.error) {
    errorEl.classList.add('gm-sp-error')
    errorEl.textContent = cached.error
  }
  container.appendChild(errorEl)

  const body = document.createElement('div')
  body.className = 'gm-sp-card-body'
  container.appendChild(body)
  source.render(body, (cached?.data ?? null) as T | null)
}

export function formatRelativeTime(fetchedAt: number | null, now: number): string {
  if (!fetchedAt) return '从未更新'
  const diff = Math.max(0, now - fetchedAt)
  if (diff < 60_000) return '刚刚'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}
