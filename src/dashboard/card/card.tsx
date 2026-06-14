import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { Runtime } from '../../runtime'
import type { CachedSource, Source } from '../types'
import { CardTitle, RefreshTime, RefreshButton, ConfigButton } from './primitives'
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
  const Comp = source.RenderComponent!
  const HeaderComp = source.RenderHeader
  const data = (cached?.data ?? null) as T | null
  const [, setHeaderVersion] = useState(0)

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
    onHeaderChange: source.headerState ? () => setHeaderVersion((n) => n + 1) : undefined,
  }

  const header: ComponentChildren = HeaderComp ? (
    <>
      <HeaderComp {...headerProps} />
      {!source.hideHeaderActions && (
        <span class="gm-sp-card-actions">
          <RefreshTime cached={headerProps.cached} now={now} ttlMs={ttlMs} />
          <RefreshButton onRefresh={onRefresh} />
          {onEdit && <ConfigButton onClick={onEdit} />}
        </span>
      )}
    </>
  ) : (
    <>
      <CardTitle>{source.title}</CardTitle>
      <span class="gm-sp-card-actions">
        <RefreshTime cached={headerProps.cached} now={now} ttlMs={ttlMs} />
        <RefreshButton onRefresh={onRefresh} />
        {onEdit && <ConfigButton onClick={onEdit} />}
      </span>
    </>
  )

  return (
    <Card header={header} error={cached?.error ?? ''}>
      <Comp
        data={data}
        root={root}
        runtime={runtime}
        onHeaderChange={source.headerState ? () => setHeaderVersion((n) => n + 1) : undefined}
      />
    </Card>
  )
}
