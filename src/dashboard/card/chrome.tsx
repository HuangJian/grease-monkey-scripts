import { useRef } from 'preact/hooks'

export type CardEdit = {
  sourceTitle: string
  createEditor: () => import('../types').SourceEditor
  onRevert: () => void
  dialogTitle?: string
  icon: string
}

export const EDIT_ICONS: Record<string, string> = { xit: '\u270F' }
export const DEFAULT_EDIT_ICON = '\u2699'

export function formatRelativeTime(fetchedAt: number | null, now: number): string {
  if (fetchedAt == null) return '\u4ECE\u672A\u66F4\u65B0'
  const diff = Math.max(0, now - fetchedAt)
  if (diff < 60_000) return '\u521A\u521A'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} \u5206\u949F\u524D`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} \u5C0F\u65F6\u524D`
  const days = Math.floor(hours / 24)
  return `${days} \u5929\u524D`
}

export type CardActionsProps = {
  cached: { fetchedAt: number } | null
  now: number
  ttlMs: number
  editIcon?: string
  onEdit?: () => void
  onRefresh: () => Promise<void>
}

export function CardActions({ cached, now, ttlMs, editIcon, onEdit, onRefresh }: CardActionsProps) {
  const refreshRef = useRef<HTMLButtonElement>(null)
  const isStale = cached != null && now - cached.fetchedAt > ttlMs * 3
  const timeAgo = cached ? formatRelativeTime(cached.fetchedAt, now) : ''

  async function handleRefresh() {
    const btn = refreshRef.current
    if (!btn) return
    btn.disabled = true
    btn.classList.add('gm-sp-refresh-loading')
    try {
      await onRefresh()
    } catch {
      // swallow so .finally always runs
    } finally {
      btn.disabled = false
      btn.classList.remove('gm-sp-refresh-loading')
    }
  }

  return (
    <>
      <span class="gm-sp-card-title">
        {cached && <span class="gm-sp-card-time">{timeAgo}</span>}
        {isStale && <span class="gm-sp-card-stale">数据陈旧</span>}
      </span>
      <span class="gm-sp-card-actions">
        {editIcon && onEdit && (
          <button type="button" class="gm-sp-edit" onClick={onEdit} data-action="edit">
            {editIcon}
          </button>
        )}
        <button type="button" class="gm-sp-refresh" onClick={handleRefresh} ref={refreshRef}>
          <span class="gm-sp-refresh-icon">{'\u21BB'}</span>
        </button>
      </span>
    </>
  )
}
