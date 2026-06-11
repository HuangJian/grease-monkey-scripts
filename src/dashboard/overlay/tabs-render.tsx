import { render } from 'preact'
import type { Runtime } from '../../runtime'
import type { CardGroup } from '../card-group'
import type { CachedSource } from '../types'
import { TabsCard } from '../ui/tabs-card'

export type TabsCardOptions = {
  group: CardGroup
  caches: ReadonlyMap<string, CachedSource<unknown> | null>
  now: number
  runtime: Runtime
  root: ShadowRoot
  activeTabId: string
  onTabChange: (tabId: string) => void
  onRefresh: (sourceId: string) => Promise<void>
  onEdit: (sourceId: string) => void
}

export function renderTabsCard(container: HTMLElement, options: TabsCardOptions): void {
  container.dataset['source'] = options.group.id
  render(<TabsCard {...options} />, container)
}
