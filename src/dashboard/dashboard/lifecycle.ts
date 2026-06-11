import type { Runtime } from '../../runtime'
import { mountOverlay, type OverlayHandle } from '../overlay/mount'
import { handleEscapeKey } from '../shortcut'
import type { CardGroup } from '../card-group'
import type { CachedSource } from '../types'
import { renderCard } from '../overlay/render'
import { renderTabsCard } from '../overlay/tabs-render'
import { isTabsGroup } from './group-renderer'

export type MountDeps = {
  runtime: Runtime
  cardGroups: CardGroup[]
  activeTabByGroup: Map<string, string>
  groupForSource: Map<string, CardGroup>
  dashboard: { close: () => void; refreshSource: (sourceId: string) => Promise<void> }
  renderGroupById: (groupId: string) => void
}

export function mountDashboard(deps: MountDeps): OverlayHandle {
  const newHandle = mountOverlay(deps.runtime.document)
  const onBackdropClick = (e: Event) => {
    if (e.target === newHandle.backdrop) deps.dashboard.close()
  }
  const onKeydown = (e: KeyboardEvent) => {
    if (newHandle.root.querySelector('.gm-sp-editor-dialog')) return
    handleEscapeKey(e, newHandle.root, () => deps.dashboard.close())
  }
  const stopKeyboardLeak = (e: Event) => {
    const target = e.target as Element | null
    const tag = target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') e.stopPropagation()
  }
  newHandle.closeBtn.addEventListener('click', () => deps.dashboard.close())
  newHandle.root.addEventListener('keydown', stopKeyboardLeak)
  newHandle.root.addEventListener('keyup', stopKeyboardLeak)
  newHandle.backdrop.addEventListener('click', onBackdropClick)
  deps.runtime.document.addEventListener('keydown', onKeydown, { capture: true })
  const origUnmount = newHandle.unmount.bind(newHandle)
  newHandle.unmount = () => {
    deps.runtime.document.removeEventListener('keydown', onKeydown, { capture: true })
    newHandle.root.removeEventListener('keydown', stopKeyboardLeak)
    newHandle.root.removeEventListener('keyup', stopKeyboardLeak)
    origUnmount()
  }
  const now = Date.now()
  for (const group of deps.cardGroups) {
    const container = group.placement === 'side' ? newHandle.sideCards : newHandle.mainCards
    container.insertAdjacentHTML('beforeend', '<div class="gm-sp-card"></div>')
    const card = container.lastElementChild as HTMLElement
    if (isTabsGroup(group)) {
      const activeTabId = deps.activeTabByGroup.get(group.id) ?? group.tabs[0]!.id
      const emptyCaches = new Map<string, CachedSource<unknown> | null>()
      for (const tab of group.tabs) emptyCaches.set(tab.id, null)
      renderTabsCard(card, {
        group,
        caches: emptyCaches,
        now,
        runtime: deps.runtime,
        root: newHandle.root,
        activeTabId,
        onTabChange: (tabId) => {
          deps.activeTabByGroup.set(group.id, tabId)
          deps.renderGroupById(group.id)
        },
        onRefresh: (sourceId) => deps.dashboard.refreshSource(sourceId),
        onEdit: (sourceId) => {
          deps.renderGroupById(deps.groupForSource.get(sourceId)?.id ?? group.id)
        },
      })
    } else {
      const source = group.tabs[0]!
      renderCard(card, {
        source,
        cached: null,
        ttlMs: source.ttlMs,
        now,
        runtime: deps.runtime,
        root: newHandle.root,
        onRefresh: () => deps.dashboard.refreshSource(source.id),
        onRevert: () => deps.renderGroupById(group.id),
      })
    }
  }
  return newHandle
}
