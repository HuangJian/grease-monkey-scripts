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
  sources.forEach((source) => {
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
  })
  const groups: CardGroup[] = []
  groupMap.forEach((group) => {
    group.tabs.sort((a, b) => {
      const pa = sourceSettings?.[a.id]?.priority ?? a.order ?? 0
      const pb = sourceSettings?.[b.id]?.priority ?? b.order ?? 0
      return pa - pb
    })
    groups.push(group)
  })
  groups.push(
    ...singletons.map((source) => ({
      id: source.id,
      placement: source.placement ?? 'main',
      tabs: [source],
    })),
  )
  return groups
}
