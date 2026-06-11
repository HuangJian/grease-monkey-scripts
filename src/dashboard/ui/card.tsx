import { useLayoutEffect, useRef } from 'preact/hooks'
import type { CachedSource, Source } from '../types'
import type { CardChromeEdit } from '../overlay/card-chrome'
import { CardChrome } from './card-chrome'

export type CardProps<T> = {
  source: Source<T>
  cached: CachedSource<T> | null
  ttlMs: number
  now: number
  runtime: import('../../runtime').Runtime
  root: ShadowRoot
  onRefresh: () => Promise<void>
  onRevert: () => void
}

function buildEdit(source: Source<unknown>, onRevert: () => void): CardChromeEdit | undefined {
  if (!source.createEditor) return undefined
  return {
    sourceTitle: source.title,
    createEditor: source.createEditor,
    onRevert,
    dialogTitle: source.dialogTitle,
  }
}

export function Card<T>({
  source,
  cached,
  ttlMs,
  now,
  runtime,
  root,
  onRefresh,
  onRevert,
}: CardProps<T>) {
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!bodyRef.current) return
    const data = (cached?.data ?? null) as T | null
    source.render(bodyRef.current, data, { root, runtime })
  })

  useLayoutEffect(() => {
    if (!source.customizeHeader) return
    const data = (cached?.data ?? null) as T | null
    const header = bodyRef.current?.closest('.gm-sp-card')?.querySelector('.gm-sp-card-title')
    if (header) source.customizeHeader(header as HTMLElement, data)
  })

  return (
    <CardChrome
      root={root}
      runtime={runtime}
      now={now}
      ttlMs={ttlMs}
      cached={cached as CachedSource<unknown> | null}
      title={<span class="gm-sp-card-title-text">{source.title}</span>}
      onRefresh={onRefresh}
      edit={buildEdit(source as unknown as Source<unknown>, onRevert)}
      headerContent={source.headerContent}
      hideDefaultHeader={source.hideDefaultHeader}
      bodyRef={(el) => {
        bodyRef.current = el
      }}
    />
  )
}
