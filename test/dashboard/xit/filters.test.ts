import { describe, expect, it, beforeEach } from 'bun:test'
import { createRuntime, type TestRuntime } from '../../runtime'
import {
  loadFilters,
  addFilter,
  updateFilter,
  deleteFilter,
  setDefaultFilter,
  getDefaultFilter,
} from '../../../src/dashboard/xit/filters'
import type { NamedFilterStore } from '../../../src/dashboard/xit/types'

function setup() {
  const runtime = createRuntime()
  return { runtime }
}

describe('filters storage', () => {
  let runtime: TestRuntime

  beforeEach(() => {
    runtime = setup().runtime
  })

  describe('loadFilters', () => {
    it('returns empty store when nothing stored', async () => {
      const store = await loadFilters(runtime)
      expect(store).toEqual({ filters: [] })
    })

    it('returns stored filters', async () => {
      const data: NamedFilterStore = {
        filters: [{ id: 'f1', name: 'Open', query: '[ ]', isDefault: false }],
      }
      runtime.stores['dashboard:v1:xit-filters'] = data
      const store = await loadFilters(runtime)
      expect(store.filters).toHaveLength(1)
      expect(store.filters[0]!.name).toBe('Open')
    })

    it('returns empty store for invalid data', async () => {
      runtime.stores['dashboard:v1:xit-filters'] = { notFilters: true }
      const store = await loadFilters(runtime)
      expect(store).toEqual({ filters: [] })
    })
  })

  describe('addFilter', () => {
    it('adds a new filter', async () => {
      const filter = await addFilter(runtime, 'Open tasks', '[ ]')
      expect(filter.name).toBe('Open tasks')
      expect(filter.query).toBe('[ ]')
      expect(filter.isDefault).toBe(false)
      expect(filter.id).toMatch(/^f\d+$/)

      const store = await loadFilters(runtime)
      expect(store.filters).toHaveLength(1)
      expect(store.filters[0]!.id).toBe(filter.id)
    })

    it('appends to existing filters', async () => {
      await addFilter(runtime, 'First', 'query1')
      await addFilter(runtime, 'Second', 'query2')

      const store = await loadFilters(runtime)
      expect(store.filters).toHaveLength(2)
      expect(store.filters[0]!.name).toBe('First')
      expect(store.filters[1]!.name).toBe('Second')
    })
  })

  describe('updateFilter', () => {
    it('updates name and query', async () => {
      const filter = await addFilter(runtime, 'Old Name', 'old query')
      await updateFilter(runtime, filter.id, { name: 'New Name', query: 'new query' })

      const store = await loadFilters(runtime)
      expect(store.filters[0]!.name).toBe('New Name')
      expect(store.filters[0]!.query).toBe('new query')
    })

    it('ignores update for nonexistent id', async () => {
      await addFilter(runtime, 'Exists', 'q')
      await updateFilter(runtime, 'nonexistent', { name: 'Ghost' })

      const store = await loadFilters(runtime)
      expect(store.filters).toHaveLength(1)
      expect(store.filters[0]!.name).toBe('Exists')
    })
  })

  describe('deleteFilter', () => {
    it('removes a filter by id', async () => {
      const f1 = await addFilter(runtime, 'A', 'q1')
      await addFilter(runtime, 'B', 'q2')
      await deleteFilter(runtime, f1.id)

      const store = await loadFilters(runtime)
      expect(store.filters).toHaveLength(1)
      expect(store.filters[0]!.name).toBe('B')
    })

    it('handles deleting nonexistent id gracefully', async () => {
      await addFilter(runtime, 'A', 'q')
      await deleteFilter(runtime, 'ghost')

      const store = await loadFilters(runtime)
      expect(store.filters).toHaveLength(1)
    })
  })

  describe('setDefaultFilter', () => {
    it('sets a filter as default', async () => {
      const f = await addFilter(runtime, 'My Filter', 'q')
      await setDefaultFilter(runtime, f.id)

      const store = await loadFilters(runtime)
      expect(store.filters[0]!.isDefault).toBe(true)
    })

    it('clears other defaults when setting a new one', async () => {
      const f1 = await addFilter(runtime, 'A', 'q1')
      const f2 = await addFilter(runtime, 'B', 'q2')
      await setDefaultFilter(runtime, f1.id)
      await setDefaultFilter(runtime, f2.id)

      const store = await loadFilters(runtime)
      expect(store.filters.find((f) => f.id === f1.id)!.isDefault).toBe(false)
      expect(store.filters.find((f) => f.id === f2.id)!.isDefault).toBe(true)
    })

    it('toggles default off when clicking same filter', async () => {
      const f = await addFilter(runtime, 'A', 'q')
      await setDefaultFilter(runtime, f.id)
      await setDefaultFilter(runtime, f.id) // toggle off

      const store = await loadFilters(runtime)
      expect(store.filters[0]!.isDefault).toBe(false)
    })
  })

  describe('getDefaultFilter', () => {
    it('returns undefined when no default', async () => {
      await addFilter(runtime, 'A', 'q')
      const store = await loadFilters(runtime)
      expect(getDefaultFilter(store)).toBeUndefined()
    })

    it('returns the default filter', async () => {
      const f = await addFilter(runtime, 'Default', 'q')
      await setDefaultFilter(runtime, f.id)
      const store = await loadFilters(runtime)
      const def = getDefaultFilter(store)
      expect(def).toBeDefined()
      expect(def!.name).toBe('Default')
    })
  })
})
