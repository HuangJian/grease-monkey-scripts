import type { ComponentChildren } from 'preact'
import type { Runtime } from '../../runtime'
import type { CachedSource, Source } from '../types'
import { readSourceData } from '../types'
import { CardTitle, CardActions } from './primitives'
import { createEditHandler } from '../shell/editor'

export type CardProps = {
  header?: ComponentChildren
  children?: ComponentChildren
  error?: string
}

export function Card({ header, children, error }: CardProps) {
  return (
    <>
      {header && <div class="gm-sp-card-header">{header}</div>}
      {error && <div class="gm-sp-card-error gm-sp-error-box">{error}</div>}
      <div class="gm-sp-card-body">{children}</div>
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
  const HeaderComp = source.RenderHeader
  const data = readSourceData(source, cached)

  const onEdit = createEditHandler({
    source: source as Source<unknown>,
    runtime,
    root,
    onRevert: () => onRevert(),
    onRefresh: () => onRefresh(),
  })

  const headerProps = {
    data,
    cached: (cached ?? null) as CachedSource<T> | null,
    now,
    ttlMs,
    runtime,
    root,
    onRefresh,
    onEdit,
  }

  const header: ComponentChildren = HeaderComp ? (
    <>
      <HeaderComp {...headerProps} />
      {!source.hideHeaderActions && (
        <CardActions
          cached={headerProps.cached}
          now={now}
          ttlMs={ttlMs}
          runtime={runtime}
          onRefresh={onRefresh}
          onEdit={onEdit}
        />
      )}
    </>
  ) : (
    <>
      <CardTitle>{source.title}</CardTitle>
      <CardActions
        cached={headerProps.cached}
        now={now}
        ttlMs={ttlMs}
        runtime={runtime}
        onRefresh={onRefresh}
        onEdit={onEdit}
      />
    </>
  )

  return (
    <Card header={header} error={cached?.error ?? ''}>
      <Comp data={data} root={root} runtime={runtime} />
    </Card>
  )
}
