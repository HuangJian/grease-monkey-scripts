import type { Runtime } from '../../runtime'
import type { CachedSource, Source } from '../types'
import { renderCardChrome } from './card-chrome'
export { formatRelativeTime } from './card-chrome'

export type CardOptions<T> = {
  source: Source<T>
  cached: CachedSource<T> | null
  ttlMs: number
  now: number
  runtime: Runtime
  root: ShadowRoot
  onRefresh: () => Promise<void>
  onRevert: () => void
}

export function renderHeader(modal: HTMLElement, options: { onClose: () => void }): void {
  modal.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-header">
      <div class="gm-sp-title">个人仪表盘</div>
      <button type="button" class="gm-sp-close" aria-label="close">×</button>
    </div>`,
  )
  modal.querySelector('.gm-sp-close')!.addEventListener('click', options.onClose)
}

export function renderCard<T>(container: HTMLElement, options: CardOptions<T>): void {
  const { source, cached, ttlMs, now, runtime, onRefresh, onRevert, root } = options
  container.dataset['source'] = source.id

  const chrome = renderCardChrome(container, {
    root,
    runtime,
    now,
    ttlMs,
    cached: cached as CachedSource<unknown> | null,
    titleHtml: `<span class="gm-sp-card-title-text">${source.title}</span>`,
    bodyHtml: '',
    onRefresh,
    edit: source.createEditor
      ? {
          sourceTitle: source.title,
          createEditor: source.createEditor,
          onRevert,
          dialogTitle: source.dialogTitle,
        }
      : undefined,
    headerContent: source.headerContent,
    hideDefaultHeader: source.hideDefaultHeader,
  })

  const data = (cached?.data ?? null) as T | null
  source.render(chrome.body, data)
  if (source.customizeHeader) {
    source.customizeHeader(chrome.header.querySelector('.gm-sp-card-title')!, data)
  }
}
