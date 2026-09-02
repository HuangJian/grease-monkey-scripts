import { isRetentionExpired } from '../shared-utils'

export interface PruneItemsOptions<T, Id> {
  items: T[]
  getId: (item: T) => Id
  getCreated: (item: T) => number
  now: number
  retentionMs: number
}

export interface PruneItemsResult<T, Id> {
  kept: T[]
  removedIds: Id[]
}

/**
 * Filter `items` by the retention window and return the survivors plus the ids
 * of everything dropped. Pure: no I/O, never touches source state.
 *
 * This is the shared core of the four `pruneExpiredCache` implementations
 * (v2ex / reddit / hupu / xueqiu). Each caller keeps its per-source apply tail —
 * `loadCache`, `state.removeEntries`, the optional `state.saveToStorage`, and
 * `saveCache` — so source-specific quirks stay local (e.g. xueqiu intentionally
 * defers `saveToStorage` to its caller).
 *
 * `Id` is the item id type — `number` for v2ex, `string` for the others — so the
 * returned `removedIds` plug straight into `state.removeEntries<T>` without a
 * cast.
 */
export function pruneItems<T, Id>(opts: PruneItemsOptions<T, Id>): PruneItemsResult<T, Id> {
  const kept: T[] = []
  const removedIds: Id[] = []
  for (const item of opts.items) {
    if (isRetentionExpired(opts.getCreated(item), opts.now, opts.retentionMs)) {
      removedIds.push(opts.getId(item))
    } else {
      kept.push(item)
    }
  }
  return { kept, removedIds }
}

export interface PruneGroupsResult<T, Id> {
  kept: Record<string, T[]>
  removedIds: Id[]
  changed: boolean
}

/**
 * `pruneItems` applied per-group over a `Record<groupKey, T[]>` container
 * (reddit / hupu shape). Groups that expire entirely are dropped from the
 * result; `changed` is true when any group lost an item.
 */
export function pruneGroups<T, Id>(
  data: Record<string, T[]>,
  getId: (item: T) => Id,
  getCreated: (item: T) => number,
  now: number,
  retentionMs: number,
): PruneGroupsResult<T, Id> {
  const kept: Record<string, T[]> = {}
  const removedIds: Id[] = []
  let changed = false
  for (const [group, items] of Object.entries(data)) {
    const result = pruneItems({ items, getId, getCreated, now, retentionMs })
    if (result.removedIds.length > 0) changed = true
    removedIds.push(...result.removedIds)
    if (result.kept.length > 0) kept[group] = result.kept
  }
  return { kept, removedIds, changed }
}
