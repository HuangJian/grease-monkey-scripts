import type { Source, SourceSettings } from './types'

export type CardGroup = {
  id: string
  placement: 'main' | 'side'
  tabs: Source<unknown>[]
}

export function buildCardGroups(
  sources: Source<unknown>[],
  sourceSettings?: Record<string, SourceSettings>,
): CardGroup[] {
  const groupMap = new Map<string, CardGroup>()
  const singletons: Source<unknown>[] = []
  for (const source of sources) {
    if (source.groupId) {
      let group = groupMap.get(source.groupId)
      if (!group) {
        group = {
          id: source.groupId,
          placement: source.placement ?? 'main',
          tabs: [],
        }
        groupMap.set(source.groupId, group)
      }
      group.tabs.push(source)
    } else {
      singletons.push(source)
    }
  }
  const groups: CardGroup[] = []
  for (const group of groupMap.values()) {
    group.tabs.sort((a, b) => {
      const pa = sourceSettings?.[a.id]?.priority ?? a.order ?? 0
      const pb = sourceSettings?.[b.id]?.priority ?? b.order ?? 0
      return pa - pb
    })
    groups.push(group)
  }
  for (const source of singletons) {
    groups.push({
      id: source.id,
      placement: source.placement ?? 'main',
      tabs: [source],
    })
  }
  return groups
}
