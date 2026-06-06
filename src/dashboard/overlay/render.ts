import type { Runtime } from '../../runtime'
import type { Source } from '../types'
import type { CachedSource } from '../types'
import { htmlToElement } from '../../utils'
import { isVeryStale } from '../cache'

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

export function showEditorDialog(
  document: Document,
  root: ShadowRoot,
  title: string,
  runtime: Runtime,
  renderEditor: (container: HTMLElement, close: () => void) => void,
): () => void {
  const backdrop = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-editor-dialog">
      <div class="gm-sp-editor-dialog-panel">
        <div class="gm-sp-editor-dialog-header">
          <span class="gm-sp-editor-dialog-title">${title}</span>
          <button type="button" class="gm-sp-editor-dialog-close" aria-label="close">×</button>
        </div>
        <div class="gm-sp-editor-dialog-body"></div>
      </div>
    </div>`,
  )

  const panel = backdrop.querySelector('.gm-sp-editor-dialog-panel') as HTMLDivElement
  const closeBtn = backdrop.querySelector('.gm-sp-editor-dialog-close') as HTMLButtonElement
  const body = backdrop.querySelector('.gm-sp-editor-dialog-body') as HTMLDivElement

  function close(): void {
    backdrop.remove()
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close()
  })
  closeBtn.addEventListener('click', close)
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  document.addEventListener('keydown', onKeydown, { capture: true })

  const origRemove = backdrop.remove.bind(backdrop)
  backdrop.remove = () => {
    document.removeEventListener('keydown', onKeydown, { capture: true })
    origRemove()
  }

  renderEditor(body, close)
  root.appendChild(backdrop)
  panel.focus()
  return close
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
  const { source, cached, ttlMs, now, runtime, onRefresh, onRevert } = options
  const document = container.ownerDocument
  const veryStale = isVeryStale(cached, ttlMs, now)
  container.replaceChildren()
  container.dataset['source'] = source.id

  const editButtonHtml = source.createEditor
    ? '<button type="button" class="gm-sp-edit" aria-label="edit">⚙</button>'
    : ''
  const staleHtml = veryStale ? '<span class="gm-sp-card-stale">数据陈旧</span>' : ''
  const errorText = cached?.error ?? ''
  const errorClasses = `gm-sp-card-error${cached?.error ? ' gm-sp-error' : ''}`
  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-card-header">
      <div class="gm-sp-card-title">
        <span class="gm-sp-card-title-text">${source.title}</span>
      </div>
      ${staleHtml}
      <div class="gm-sp-card-actions">
        <span class="gm-sp-card-updated">
          ${formatRelativeTime(cached?.fetchedAt ?? null, now)}
        </span>
        <button type="button" class="gm-sp-refresh" aria-label="refresh">
          <span class="gm-sp-refresh-icon">↻</span>
        </button>
        ${editButtonHtml}
      </div>
    </div>
    <div class="${errorClasses}">${errorText}</div>
    <div class="gm-sp-card-body"></div>`,
  )
  const header = container.querySelector('.gm-sp-card-header')!
  const refresh = header.querySelector('.gm-sp-refresh') as HTMLButtonElement
  refresh.addEventListener('click', () => {
    refresh.disabled = true
    refresh.classList.add('gm-sp-refresh-loading')
    onRefresh().then(
      () => {
        refresh.disabled = false
        refresh.classList.remove('gm-sp-refresh-loading')
      },
      () => {
        refresh.disabled = false
        refresh.classList.remove('gm-sp-refresh-loading')
      },
    )
  })
  if (source.createEditor) {
    const edit = header.querySelector('.gm-sp-edit') as HTMLButtonElement
    edit.addEventListener('click', () => {
      showEditorDialog(
        document,
        options.root,
        source.title,
        runtime,
        async (dialogBody, dialogClose) => {
          const editor = source.createEditor!()
          await editor(dialogBody, { runtime, onRevert, close: dialogClose })
        },
      )
    })
  }
  const body = container.querySelector('.gm-sp-card-body')! as HTMLElement
  const data = (cached?.data ?? null) as T | null
  source.render(body, data)
  if (source.customizeHeader) {
    source.customizeHeader(header.querySelector('.gm-sp-card-title')!, data)
  }
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
