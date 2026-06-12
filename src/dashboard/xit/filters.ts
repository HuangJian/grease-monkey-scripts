import type { Runtime } from '../../runtime'
import type { NamedFilter, NamedFilterStore } from './types'

const STORAGE_KEY = 'dashboard:v1:xit-filters'

let nextId = 1

function bumpNextId(store: NamedFilterStore): void {
  for (const f of store.filters) {
    const m = /^f(\d+)$/.exec(f.id)
    if (m) {
      const n = Number(m[1]) + 1
      if (n > nextId) nextId = n
    }
  }
}

function deduplicateIds(store: NamedFilterStore): boolean {
  const seen = new Set<string>()
  let changed = false
  for (const f of store.filters) {
    if (seen.has(f.id)) {
      f.id = `f${nextId++}`
      changed = true
    }
    seen.add(f.id)
  }
  return changed
}

function emptyStore(): NamedFilterStore {
  return { filters: [] }
}

export async function loadFilters(runtime: Runtime): Promise<NamedFilterStore> {
  const raw = await runtime.getValue<NamedFilterStore | null>(STORAGE_KEY, null)
  if (!raw || !Array.isArray(raw.filters)) return emptyStore()
  bumpNextId(raw)
  const changed = deduplicateIds(raw)
  if (changed) await saveFilters(runtime, raw)
  return raw
}

export async function saveFilters(runtime: Runtime, store: NamedFilterStore): Promise<void> {
  await runtime.setValue(STORAGE_KEY, store)
}

export async function addFilter(
  runtime: Runtime,
  name: string,
  query: string,
): Promise<NamedFilter> {
  const store = await loadFilters(runtime)
  const filter: NamedFilter = {
    id: `f${nextId++}`,
    name,
    query,
    isDefault: false,
  }
  store.filters.push(filter)
  await saveFilters(runtime, store)
  return filter
}

export async function updateFilter(
  runtime: Runtime,
  id: string,
  patch: Partial<Pick<NamedFilter, 'name' | 'query' | 'isDefault'>>,
): Promise<void> {
  const store = await loadFilters(runtime)
  const filter = store.filters.find((f) => f.id === id)
  if (!filter) return
  if (patch.name !== undefined) filter.name = patch.name
  if (patch.query !== undefined) filter.query = patch.query
  if (patch.isDefault !== undefined) {
    if (patch.isDefault) {
      for (const f of store.filters) f.isDefault = false
    }
    filter.isDefault = patch.isDefault
  }
  await saveFilters(runtime, store)
}

export async function deleteFilter(runtime: Runtime, id: string): Promise<void> {
  const store = await loadFilters(runtime)
  store.filters = store.filters.filter((f) => f.id !== id)
  await saveFilters(runtime, store)
}

export async function setDefaultFilter(runtime: Runtime, id: string): Promise<void> {
  const store = await loadFilters(runtime)
  for (const f of store.filters) {
    f.isDefault = f.id === id ? !f.isDefault : false
  }
  await saveFilters(runtime, store)
}

export function getDefaultFilter(store: NamedFilterStore): NamedFilter | undefined {
  return store.filters.find((f) => f.isDefault)
}
