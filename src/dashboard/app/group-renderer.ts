import { render } from 'preact'
import { h } from 'preact'
import type { Runtime } from '../../runtime'
import { loadCache } from '../cache'
import type { CachedSource, SourceSettings } from '../types'
import type { CardGroup } from '../card-group'
import { RenderCard } from '../card/card'
import { TabsCard } from '../card/tabs-card'
import type { OverlayHandle } from '../shell/mount'

export type GroupRendererDeps = {
  runtime: Runtime
  handle: OverlayHandle
  activeTabByGroup: Map<string, string>
  sourceSettings: Record<string, SourceSettings>
  refreshSource: (sourceId: string) => Promise<void>
  revertGroup: (groupId: string) => void
}

export function isTabsGroup(group: CardGroup): boolean {
  return group.tabs.length > 1
}

export function cardForGroup(root: ShadowRoot, groupId: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-source="${groupId}"]`)
}

async function readGroupCaches(
  runtime: Runtime,
  group: CardGroup,
): Promise<Map<string, CachedSource<unknown> | null>> {
  const map = new Map<string, CachedSource<unknown> | null>()
  await Promise.all(
    group.tabs.map(async (tab) => {
      map.set(tab.id, await loadCache<unknown>(runtime, tab.id))
    }),
  )
  return map
}

export async function renderGroup(
  group: CardGroup,
  groupForSource: Map<string, CardGroup>,
  groupById: Map<string, CardGroup>,
  deps: GroupRendererDeps,
): Promise<void> {
  const root = deps.handle.root
  const card = cardForGroup(root, group.id)
  if (!card) return
  const caches = await readGroupCaches(deps.runtime, group)
  const activeTabId = deps.activeTabByGroup.get(group.id) ?? group.tabs[0]!.id
  if (isTabsGroup(group)) {
    card.dataset['source'] = group.id
    render(
      h(TabsCard, {
        group,
        caches,
        now: Date.now(),
        runtime: deps.runtime,
        root,
        activeTabId,
        sourceSettings: deps.sourceSettings,
        onTabChange: (tabId) => {
          deps.activeTabByGroup.set(group.id, tabId)
          void renderGroupById(group.id, groupById, groupForSource, deps)
        },
        onRefresh: (sourceId) => deps.refreshSource(sourceId),
        onEdit: (sourceId) => {
          void renderGroupById(
            groupForSource.get(sourceId)?.id ?? group.id,
            groupById,
            groupForSource,
            deps,
          )
        },
      }),
      card,
    )
  } else {
    const source = group.tabs[0]!
    const cached = caches.get(source.id) ?? null
    card.dataset['source'] = source.id
    render(
      h(RenderCard, {
        source,
        cached,
        ttlMs: source.ttlMs,
        now: Date.now(),
        runtime: deps.runtime,
        root,
        onRefresh: () => deps.refreshSource(source.id),
        onRevert: () => deps.revertGroup(group.id),
      }),
      card,
    )
  }
}

export async function renderGroupById(
  groupId: string,
  groupById: Map<string, CardGroup>,
  groupForSource: Map<string, CardGroup>,
  deps: GroupRendererDeps,
): Promise<void> {
  const group = groupById.get(groupId)
  if (!group) return
  await renderGroup(group, groupForSource, groupById, deps)
}

export async function renderAllGroups(
  cardGroups: CardGroup[],
  groupForSource: Map<string, CardGroup>,
  groupById: Map<string, CardGroup>,
  deps: GroupRendererDeps,
): Promise<void> {
  await Promise.all(cardGroups.map((group) => renderGroup(group, groupForSource, groupById, deps)))
}
