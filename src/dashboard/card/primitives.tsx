import { useRef, useState, useEffect } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { CachedSource } from '../types'
import { VERY_STALE_MULTIPLIER } from '../types'
import { RefreshIcon, ConfigIcon } from './icons'

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

export type CardTitleProps = {
  children: ComponentChildren
}

export function CardTitle({ children }: CardTitleProps) {
  return <span class="gm-sp-card-title">{children}</span>
}

export type RefreshTimeProps = {
  cached: CachedSource<unknown> | null
  now: number
  ttlMs: number
}

export function RefreshTime({ cached, now, ttlMs }: RefreshTimeProps) {
  // Self-ticking clock so relative-time labels ("5 分钟前") stay fresh
  // without waiting for a tab switch or data refresh to re-render.
  const [tick, setTick] = useState(now)
  useEffect(() => {
    setTick(now)
  }, [now])
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const isStale = cached != null && tick - cached.fetchedAt > ttlMs * VERY_STALE_MULTIPLIER
  const timeAgo = cached ? formatRelativeTime(cached.fetchedAt, tick) : null

  return (
    <span class="gm-sp-refresh-time">
      {timeAgo && <span>{timeAgo}</span>}
      {isStale && <span class="gm-sp-card-stale">{'\u6570\u636E\u9648\u65E7'}</span>}
    </span>
  )
}

export type CardActionsProps = {
  cached: CachedSource<unknown> | null
  now: number
  ttlMs: number
  onRefresh: () => Promise<void>
  onEdit?: () => Promise<void>
}

export function CardActions({ cached, now, ttlMs, onRefresh, onEdit }: CardActionsProps) {
  return (
    <span class="gm-sp-card-actions">
      <RefreshTime cached={cached} now={now} ttlMs={ttlMs} />
      <RefreshButton onRefresh={onRefresh} />
      {onEdit && <ConfigButton onClick={onEdit} />}
    </span>
  )
}

export type RefreshButtonProps = {
  onRefresh: () => Promise<void>
}

export function RefreshButton({ onRefresh }: RefreshButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null)

  async function handleClick() {
    const btn = btnRef.current
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
    <button type="button" class="gm-sp-refresh" onClick={handleClick} ref={btnRef}>
      <RefreshIcon />
    </button>
  )
}

export type ConfigButtonProps = {
  onClick: () => void
}

export function ConfigButton({ onClick }: ConfigButtonProps) {
  return (
    <button type="button" class="gm-sp-edit" onClick={onClick} data-action="edit">
      <ConfigIcon />
    </button>
  )
}

export type ItemActionsProps = {
  onBulkRead: () => void
  onHide: () => void
}

export function ItemActions({ onBulkRead, onHide }: ItemActionsProps) {
  return (
    <span class="gm-sp-item-actions">
      <button
        type="button"
        class="gm-sp-item-bulk-btn"
        title="将顶端至此主题全部标记已读"
        onClick={onBulkRead}
      >
        {'\u2191'}已读
      </button>
      <button type="button" class="gm-sp-item-hide" title="隐藏该主题" onClick={onHide}>
        {'\u00D7'}隐藏
      </button>
    </span>
  )
}
