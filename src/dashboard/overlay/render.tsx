import { render } from 'preact'
import type { Runtime } from '../../runtime'
import type { CachedSource, Source } from '../types'
import { Card } from '../ui/card'
export { formatRelativeTime } from './card-chrome'

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

export function renderCard<T>(container: HTMLElement, options: CardOptions<T>): void {
  const { source, onRevert } = options
  container.dataset['source'] = source.id
  render(<Card {...options} onRevert={onRevert} />, container)
}
