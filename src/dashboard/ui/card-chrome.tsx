import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import type { Runtime } from '../../runtime'
import type { CachedSource } from '../types'
import { isVeryStale } from '../cache'
import { showEditorDialog } from '../overlay/editor'
import { formatRelativeTime } from '../overlay/card-chrome'
import type { CardChromeEdit } from '../overlay/card-chrome'

export type CardChromeProps = {
  root: ShadowRoot
  runtime: Runtime
  now: number
  ttlMs: number
  cached: CachedSource<unknown> | null
  title: ComponentChildren
  onRefresh: () => Promise<void>
  edit?: CardChromeEdit
  headerContent?: string
  hideDefaultHeader?: boolean
  bodyRef?: (el: HTMLDivElement | null) => void
  children?: ComponentChildren
}

export function CardChrome({
  root,
  runtime,
  now,
  ttlMs,
  cached,
  title,
  onRefresh,
  edit,
  headerContent,
  hideDefaultHeader,
  bodyRef,
  children,
}: CardChromeProps) {
  const headerRef = useRef<HTMLDivElement>(null)
  const refreshBtnRef = useRef<HTMLButtonElement>(null)
  const veryStale = isVeryStale(cached, ttlMs, now)
  const errorText = cached?.error ?? ''

  async function handleRefresh() {
    const btn = refreshBtnRef.current
    if (btn) {
      btn.disabled = true
      btn.classList.add('gm-sp-refresh-loading')
    }
    try {
      await onRefresh()
    } catch {
      // swallow — loading is cleared in finally
    } finally {
      if (btn) {
        btn.disabled = false
        btn.classList.remove('gm-sp-refresh-loading')
      }
    }
  }

  function handleEdit() {
    if (!edit) return
    const doc = runtime.document
    showEditorDialog(
      doc,
      root,
      edit.dialogTitle ?? edit.sourceTitle,
      runtime,
      async (dialogBody, dialogClose) => {
        const editor = edit.createEditor()
        return editor(dialogBody, { runtime, onRevert: edit.onRevert, close: dialogClose })
      },
    )
  }

  useEffect(() => {
    if (hideDefaultHeader && edit && headerRef.current) {
      const row = headerRef.current.querySelector('.gm-sp-xit-header-row')
      if (row && !row.querySelector('.gm-sp-edit')) {
        const icon = edit.sourceTitle === 'xit' ? '\u270F' : '\u2699'
        row.insertAdjacentHTML(
          'beforeend',
          `<button type="button" class="gm-sp-btn gm-sp-btn-icon gm-sp-edit" data-action="edit" aria-label="edit"><span class="gm-sp-edit-icon">${icon}</span></button>`,
        )
        row.querySelector('.gm-sp-edit')!.addEventListener('click', handleEdit)
      }
    }
  })

  const editIcon = edit?.sourceTitle === 'xit' ? '\u270F' : '\u2699'

  return (
    <>
      {hideDefaultHeader ? (
        <div
          class="gm-sp-card-header gm-sp-card-header-custom"
          ref={headerRef}
          dangerouslySetInnerHTML={{ __html: headerContent ?? '' }}
        />
      ) : (
        <div class="gm-sp-card-header" ref={headerRef}>
          <div class="gm-sp-card-title">{title}</div>
          {veryStale && <span class="gm-sp-card-stale">{'\u6570\u636E\u9648\u65E7'}</span>}
          <div class="gm-sp-card-actions">
            <span class="gm-sp-card-updated">
              {formatRelativeTime(cached?.fetchedAt ?? null, now)}
            </span>
            <button
              type="button"
              class="gm-sp-btn gm-sp-btn-icon gm-sp-refresh"
              data-action="refresh"
              aria-label="refresh"
              onClick={handleRefresh}
              ref={refreshBtnRef}
            >
              <span class="gm-sp-refresh-icon">{'\u21BB'}</span>
            </button>
            {edit && (
              <button
                type="button"
                class="gm-sp-btn gm-sp-btn-icon gm-sp-edit"
                data-action="edit"
                aria-label="edit"
                onClick={handleEdit}
              >
                <span class="gm-sp-edit-icon">{editIcon}</span>
              </button>
            )}
          </div>
        </div>
      )}
      <div
        class={cached?.error ? 'gm-sp-card-error gm-sp-error-box' : 'gm-sp-card-error gm-sp-hidden'}
      >
        {errorText}
      </div>
      <div class="gm-sp-card-body" ref={bodyRef}>
        {children}
      </div>
    </>
  )
}
