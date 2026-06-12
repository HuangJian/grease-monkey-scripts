import { useLayoutEffect, useRef } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { Runtime } from '../../runtime'
import type { CachedSource, Source } from '../types'
import { EDIT_ICONS, DEFAULT_EDIT_ICON, CardActions } from './chrome'
import { showEditorDialog } from '../shell/editor'

export type CardProps = {
  header?: ComponentChildren
  children?: ComponentChildren
  error?: string
  bodyRef?: (el: HTMLDivElement | null) => void
}

export function Card({ header, children, error, bodyRef }: CardProps) {
  return (
    <>
      {header && <div class="gm-sp-card-header">{header}</div>}
      {error && <div class="gm-sp-card-error gm-sp-error-box">{error}</div>}
      <div class="gm-sp-card-body" ref={bodyRef}>
        {children}
      </div>
    </>
  )
}

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

export function RenderCard<T>({
  source,
  cached,
  ttlMs,
  now,
  runtime,
  root,
  onRefresh,
  onRevert,
}: CardOptions<T>) {
  const Comp = source.RenderComponent
  const data = (cached?.data ?? null) as T | null
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const edit = source.createEditor
    ? { icon: EDIT_ICONS[source.title] ?? DEFAULT_EDIT_ICON }
    : undefined
  const onEdit = edit
    ? () => {
        showEditorDialog(
          document,
          root,
          source.dialogTitle ?? `\u7F16\u8F91 - ${source.title}`,
          runtime,
          (container, close) => {
            const editor = source.createEditor!()
            return editor(container, { runtime, onRevert, close })
          },
        )
      }
    : undefined

  useLayoutEffect(() => {
    if (Comp || !bodyRef.current) return
    source.render(bodyRef.current, data, { root, runtime })
  })

  const header: ComponentChildren = (
    <>
      <span class="gm-sp-card-title">
        <span>{source.title}</span>
      </span>
      <CardActions
        cached={(cached ?? null) as { fetchedAt: number } | null}
        now={now}
        ttlMs={ttlMs}
        editIcon={edit?.icon}
        onEdit={onEdit}
        onRefresh={onRefresh}
      />
    </>
  )

  return (
    <Card
      header={header}
      error={cached?.error ?? ''}
      bodyRef={
        Comp
          ? undefined
          : (el) => {
              bodyRef.current = el
            }
      }
    >
      {Comp ? <Comp data={data} root={root} runtime={runtime} /> : null}
    </Card>
  )
}
