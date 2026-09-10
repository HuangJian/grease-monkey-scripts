import { describe, expect, test } from 'bun:test'
import { createRuntime } from '../../runtime'
import { DEFAULT_CONFIG } from '../../../src/prism/config/defaults'
import type { Config } from '../../../src/prism/config/types'
import { createSourceRegistry, findSource } from '../../../src/prism/app/source-registry'

// §4.7 / §5.6(I2) — `createSourceRegistry` is the integration root that wires
// every source factory together and builds the card-group maps. It was the
// highest-risk untested path. This exercises the real builder (not mocks) with
// the production `DEFAULT_CONFIG`, so a broken source factory or a drift in the
// `AnySource` union surfaces here instead of at dashboard-open time.

const baseConfig = structuredClone(DEFAULT_CONFIG) as Config

const EXPECTED_IDS_ENABLED = [
  'v2ex',
  'weather',
  'novels',
  'reddit',
  'hupu',
  'rss',
  'tnews',
  'xueqiu-news',
  'xueqiu-hot',
  'xit',
  'misc',
] as const

describe('createSourceRegistry', () => {
  test('builds every source (xit enabled by default)', () => {
    const runtime = createRuntime()
    const reg = createSourceRegistry(baseConfig, runtime)
    expect(reg.sources).toHaveLength(EXPECTED_IDS_ENABLED.length)
    for (const id of EXPECTED_IDS_ENABLED) {
      expect(findSource(reg.sources, id)?.id, `source ${id} present`).toBe(id)
    }
  })

  test('every source resolves to a card group (groupForSource map is complete)', () => {
    const reg = createSourceRegistry(baseConfig, createRuntime())
    expect(reg.groupForSource.size).toBe(reg.sources.length)
    for (const source of reg.sources) {
      const group = reg.groupForSource.get(source.id)
      expect(group, `group for ${source.id}`).toBeDefined()
      expect(reg.groupById.get(group!.id)).toBe(group)
    }
  })

  test('omits xit when config.xit.enabled === false', () => {
    const runtime = createRuntime()
    const reg = createSourceRegistry(
      { ...baseConfig, xit: { ...baseConfig.xit, enabled: false } },
      runtime,
    )
    expect(reg.sources).toHaveLength(EXPECTED_IDS_ENABLED.length - 1)
    expect(findSource(reg.sources, 'xit')).toBeUndefined()
    expect(findSource(reg.sources, 'misc')?.id).toBe('misc')
  })

  test('tnews dual-source exposes mainSource + hotSource as distinct members', () => {
    const reg = createSourceRegistry(baseConfig, createRuntime())
    const ids = reg.sources.map((s) => s.id)
    expect(ids).toContain('xueqiu-news')
    expect(ids).toContain('xueqiu-hot')
  })

  test('rss is registered even with no feeds configured (empty state guides the user)', () => {
    const reg = createSourceRegistry(baseConfig, createRuntime())
    const rss = findSource(reg.sources, 'rss')
    expect(rss?.id).toBe('rss')
    expect(reg.groupForSource.get('rss')?.id).toBe('browse')
  })

  test('rss sorts after xueqiu-hot and before misc inside the browse group (order 6)', () => {
    const reg = createSourceRegistry(baseConfig, createRuntime())
    const tabs = reg.groupById.get('browse')!.tabs.map((s) => s.id)
    expect(tabs.indexOf('rss')).toBeGreaterThan(tabs.indexOf('xueqiu-hot'))
    expect(tabs.indexOf('rss')).toBeLessThan(tabs.indexOf('misc'))
  })
})
