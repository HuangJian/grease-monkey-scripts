import type { Runtime } from '../../runtime'
import type { CachedSource, SourceEditor } from '../types'
import { isVeryStale } from '../cache'
import { showEditorDialog } from './editor'

export type CardChromeEdit = {
  sourceTitle: string
  createEditor: () => SourceEditor
  onRevert: () => void
  dialogTitle?: string
}

export type CardChromeOptions = {
  root: ShadowRoot
  runtime: Runtime
  now: number
  ttlMs: number
  cached: CachedSource<unknown> | null
  titleHtml: string
  bodyHtml: string
  onRefresh: () => Promise<void>
  edit?: CardChromeEdit
  headerContent?: string
  hideDefaultHeader?: boolean
}

export type CardChrome = {
  header: HTMLElement
  body: HTMLElement
  refreshButton: HTMLButtonElement
}

export function renderCardChrome(container: HTMLElement, options: CardChromeOptions): CardChrome {
  const {
    root,
    runtime,
    now,
    ttlMs,
    cached,
    titleHtml,
    bodyHtml,
    onRefresh,
    edit,
    headerContent,
    hideDefaultHeader,
  } = options
  const document = container.ownerDocument
  const veryStale = isVeryStale(cached, ttlMs, now)
  container.replaceChildren()

  const editIcon = edit?.sourceTitle === 'xit' ? '✏' : '⚙'
  const editButtonHtml = edit
    ? `<button type="button" class="gm-sp-edit" aria-label="edit"><span class="gm-sp-edit-icon">${editIcon}</span></button>`
    : ''

  let headerHtml: string
  if (hideDefaultHeader) {
    headerHtml = `<div class="gm-sp-card-header gm-sp-card-header-custom">
      ${headerContent ?? ''}
    </div>`
  } else {
    const staleHtml = veryStale ? '<span class="gm-sp-card-stale">数据陈旧</span>' : ''
    headerHtml = `<div class="gm-sp-card-header">
      <div class="gm-sp-card-title">${titleHtml}</div>
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
    </div>`
  }

  const errorText = cached?.error ?? ''
  const errorClasses = `gm-sp-card-error${cached?.error ? ' gm-sp-error' : ''}`
  container.insertAdjacentHTML(
    'beforeend',
    `${headerHtml}
    <div class="${errorClasses}">${errorText}</div>
    <div class="gm-sp-card-body">${bodyHtml}</div>`,
  )
  const header = container.querySelector('.gm-sp-card-header') as HTMLElement

  if (hideDefaultHeader && edit) {
    const headerRow = header.querySelector('.gm-sp-xit-header-row')
    if (headerRow) headerRow.insertAdjacentHTML('beforeend', editButtonHtml)
  }

  if (!hideDefaultHeader) {
    const refreshButton = header.querySelector('.gm-sp-refresh') as HTMLButtonElement
    refreshButton.addEventListener('click', () => {
      refreshButton.disabled = true
      refreshButton.classList.add('gm-sp-refresh-loading')
      onRefresh().then(
        () => {
          refreshButton.disabled = false
          refreshButton.classList.remove('gm-sp-refresh-loading')
        },
        () => {
          refreshButton.disabled = false
          refreshButton.classList.remove('gm-sp-refresh-loading')
        },
      )
    })
  }

  if (edit) {
    const e = edit
    const editBtn = header.querySelector('.gm-sp-edit') as HTMLButtonElement
    editBtn.addEventListener('click', () => {
      showEditorDialog(
        document,
        root,
        e.dialogTitle ?? e.sourceTitle,
        runtime,
        async (dialogBody, dialogClose) => {
          const editor = e.createEditor()
          return editor(dialogBody, { runtime, onRevert: e.onRevert, close: dialogClose })
        },
      )
    })
  }
  const body = container.querySelector('.gm-sp-card-body') as HTMLElement
  const refreshButton = header.querySelector('.gm-sp-refresh') as HTMLButtonElement
  return { header, body, refreshButton }
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
