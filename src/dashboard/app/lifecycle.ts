import { render } from 'preact'
import { h } from 'preact'
import type { Runtime } from '../../runtime'
import { mountOverlay, type OverlayHandle } from '../shell/mount'
import type { CardGroup } from '../card-group'
import type { CachedSource, SourceSettings } from '../types'
import { RenderCard } from '../card/card'
import { TabsCard } from '../card/tabs-card'
import { isTabsGroup } from './group-renderer'
import { OverlayShell } from '../shell/overlay-shell'

export type MountDeps = {
  runtime: Runtime
  cardGroups: CardGroup[]
  activeTabByGroup: Map<string, string>
  groupForSource: Map<string, CardGroup>
  sourceSettings: Record<string, SourceSettings>
  dashboard: { close: () => void; refreshSource: (sourceId: string) => Promise<void> }
  renderGroupById: (groupId: string) => void
}

export function mountDashboard(deps: MountDeps): OverlayHandle {
  const newHandle = mountOverlay(deps.runtime.document)
  const onBackdropClick = (e: Event) => {
    if (e.target === newHandle.backdrop) deps.dashboard.close()
  }
  const shellContainer = deps.runtime.document.createElement('div')
  newHandle.root.appendChild(shellContainer)
  render(
    h(OverlayShell, {
      root: newHandle.root,
      document: deps.runtime.document,
      onClose: () => deps.dashboard.close(),
    }),
    shellContainer,
  )
  newHandle.closeBtn.addEventListener('click', () => deps.dashboard.close())
  newHandle.backdrop.addEventListener('click', onBackdropClick)
  const origUnmount = newHandle.unmount.bind(newHandle)
  newHandle.unmount = () => {
    render(null, shellContainer)
    shellContainer.remove()
    origUnmount()
  }
  const now = Date.now()
  for (const group of deps.cardGroups) {
    const container = group.placement === 'side' ? newHandle.sideCards : newHandle.mainCards
    const card = document.createElement('div')
    card.className = 'gm-sp-card'
    container.appendChild(card)
    if (isTabsGroup(group)) {
      const activeTabId = deps.activeTabByGroup.get(group.id) ?? group.tabs[0]!.id
      const emptyCaches = new Map<string, CachedSource<unknown> | null>()
      for (const tab of group.tabs) emptyCaches.set(tab.id, null)
      card.dataset['source'] = group.id
      render(
        h(TabsCard, {
          group,
          caches: emptyCaches,
          now,
          runtime: deps.runtime,
          root: newHandle.root,
          activeTabId,
          sourceSettings: deps.sourceSettings,
          onTabChange: (tabId) => {
            deps.activeTabByGroup.set(group.id, tabId)
            deps.renderGroupById(group.id)
          },
          onRefresh: (sourceId) => deps.dashboard.refreshSource(sourceId),
          onEdit: (sourceId) => {
            deps.renderGroupById(deps.groupForSource.get(sourceId)?.id ?? group.id)
          },
        }),
        card,
      )
    } else {
      const source = group.tabs[0]!
      card.dataset['source'] = source.id
      render(
        h(RenderCard, {
          source,
          cached: null,
          ttlMs: source.ttlMs,
          now,
          runtime: deps.runtime,
          root: newHandle.root,
          onRefresh: () => deps.dashboard.refreshSource(source.id),
          onRevert: () => deps.renderGroupById(group.id),
        }),
        card,
      )
    }
  }
  return newHandle
}
