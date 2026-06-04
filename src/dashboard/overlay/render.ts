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
          <span class="gm-sp-editor-dialog-title"></span>
          <button type="button" class="gm-sp-editor-dialog-close" aria-label="close">×</button>
        </div>
        <div class="gm-sp-editor-dialog-body"></div>
      </div>
    </div>`,
  )

  const panel = backdrop.querySelector('.gm-sp-editor-dialog-panel') as HTMLDivElement
  const titleEl = backdrop.querySelector('.gm-sp-editor-dialog-title') as HTMLSpanElement
  const closeBtn = backdrop.querySelector('.gm-sp-editor-dialog-close') as HTMLButtonElement
  const body = backdrop.querySelector('.gm-sp-editor-dialog-body') as HTMLDivElement

  titleEl.textContent = title

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
  const { source, cached, ttlMs, now, runtime, onRefresh, onRevert } = options
  const document = container.ownerDocument
  const veryStale = isVeryStale(cached, ttlMs, now)
  container.replaceChildren()
  container.dataset['source'] = source.id

  const editButtonHtml = source.createEditor
    ? '<button type="button" class="gm-sp-edit" aria-label="edit">⚙</button>'
    : ''
  const header = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-card-header">
      <div class="gm-sp-card-title">
        <span class="gm-sp-card-title-text"></span>
      </div>
      <div class="gm-sp-card-actions">
        <span class="gm-sp-card-updated"></span>
        <button type="button" class="gm-sp-refresh" aria-label="refresh"><span class="gm-sp-refresh-icon">↻</span></button>
        ${editButtonHtml}
      </div>
    </div>`,
  )
  header.querySelector('.gm-sp-card-title-text')!.textContent = source.title
  if (veryStale) {
    const badge = htmlToElement<HTMLSpanElement>(
      document,
      '<span class="gm-sp-card-stale">数据陈旧</span>',
    )
    header.insertBefore(badge, header.querySelector('.gm-sp-card-actions')!)
  }
  const updated = header.querySelector('.gm-sp-card-updated')!
  updated.textContent = formatRelativeTime(cached?.fetchedAt ?? null, now)
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
