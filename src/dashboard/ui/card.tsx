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
  const Comp = source.RenderComponent
  const data = (cached?.data ?? null) as T | null

  const bodyRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (Comp || !bodyRef.current) return
    source.render(bodyRef.current, data, { root, runtime })
  })

  useLayoutEffect(() => {
    if (Comp || !source.customizeHeader) return
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
      headerContent={Comp ? undefined : source.headerContent}
      hideDefaultHeader={Comp ? false : source.hideDefaultHeader}
      bodyRef={
        Comp
          ? undefined
          : (el) => {
              bodyRef.current = el
            }
      }
    >
      {Comp ? <Comp data={data} root={root} runtime={runtime} /> : null}
    </CardChrome>
  )
}
