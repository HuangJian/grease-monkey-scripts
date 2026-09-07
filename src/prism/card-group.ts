import type { AnySource } from './source-types'
import type { Source, SourceSettings } from './types'

export type CardGroup = {
  id: string
  placement: 'main' | 'side'
  tabs: Source<unknown>[]
}

export function buildCardGroups(
  sources: AnySource[],
  sourceSettings?: Record<string, SourceSettings>,
): CardGroup[] {
  // The registry holds the typed `AnySource` discriminated union (§2.6); the
  // render loop needs a homogeneous `Source<unknown>[]`, so the single
  // sanctioned erasure from the union back to `unknown` happens HERE — not in
  // the registry (which stays free of `as unknown as`).
  const erased = sources as unknown as Source<unknown>[]
  const groupMap = new Map<string, CardGroup>()
  const singletons: Source<unknown>[] = []
  erased.forEach((source) => {
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
