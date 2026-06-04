import type { Source } from './sources/types'

export type CardGroup = {
  id: string
  placement: 'main' | 'side'
  tabs: Source<unknown>[]
}

export function buildCardGroups(sources: Source<unknown>[]): CardGroup[] {
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
    group.tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
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
