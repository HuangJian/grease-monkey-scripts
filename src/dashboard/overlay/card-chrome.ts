export type CardChromeEdit = {
  sourceTitle: string
  createEditor: () => import('../types').SourceEditor
  onRevert: () => void
  dialogTitle?: string
}

export type { CardChromeProps as CardChromeOptions } from '../ui/card-chrome'

export function formatRelativeTime(fetchedAt: number | null, now: number): string {
  if (!fetchedAt) return '\u4ECE\u672A\u66F4\u65B0'
  const diff = Math.max(0, now - fetchedAt)
  if (diff < 60_000) return '\u521A\u521A'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} \u5206\u949F\u524D`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} \u5C0F\u65F6\u524D`
  const days = Math.floor(hours / 24)
  return `${days} \u5929\u524D`
}
