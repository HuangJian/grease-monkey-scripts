import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createV2exEditor } from '../../../../src/dashboard/v2ex/editor'
import type { V2exSourceOptions } from '../../../../src/dashboard/v2ex/types'
import { CONFIG_KEY, DEFAULT_SOURCE_SETTINGS } from '../../../../src/dashboard/types'
import { createRuntime, type TestRuntime } from '../../../runtime'

const DEFAULTS: V2exSourceOptions = {
  ttlMinutes: 30,
  retentionDays: 7,
  todayMinReplies: 10,
  olderMinReplies: 20,
  ageHalfLifeDays: 2,
}

async function mount(
  runtime: TestRuntime,
  container: HTMLElement,
  options: V2exSourceOptions = DEFAULTS,
) {
  let closeCalls = 0
  const editor = createV2exEditor(options, DEFAULT_SOURCE_SETTINGS)
  const result = await editor(container, {
    runtime,
    onRevert: () => {},
    close: () => closeCalls++,
  })
  return { closeCalls: () => closeCalls, result }
}

describe('createV2exEditor', () => {
  let runtime: TestRuntime
  let container: HTMLElement

  beforeEach(() => {
    runtime = createRuntime()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('cancel calls close', async () => {
    const handle = await mount(runtime, container)
    handle.result.cancel?.()
    expect(handle.closeCalls()).toBe(1)
  })

  test('save preserves other config sections (regression: data loss)', async () => {
    runtime.stores[CONFIG_KEY] = {
      weather: { cities: [{ latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' }], ttlMinutes: 60 },
      novels: {
        entries: [{ url: 'https://www.sudugu.org/166/', alias: '九龙夺嫡' }],
        ttlMinutes: 60,
        initialNewChapters: 3,
        maxNewChaptersPerBook: 5,
        maxLatestWindow: 50,
      },
      reddit: {
        ttlMinutes: 30,
        subreddits: ['popular', 'aww'],
        minItems: 10,
        maxItems: 30,
        displayRatio: 0.1,
        elbowDropRatio: 0.4,
        minCutoffScore: 500,
      },
    }
    const { result } = await mount(runtime, container)
    void result.save?.()
    await new Promise<void>((r) => setTimeout(r, 0))
    const stored = runtime.stores[CONFIG_KEY] as Record<string, unknown>
    expect(stored['weather']).toBeDefined()
    expect(stored['novels']).toBeDefined()
    expect(stored['reddit']).toBeDefined()
    expect((stored['weather'] as { cities: unknown[] }).cities).toHaveLength(1)
    expect((stored['reddit'] as { subreddits: string[] }).subreddits).toEqual(['popular', 'aww'])
    expect((stored['v2ex'] as { todayMinReplies: number }).todayMinReplies).toBe(10)
  })

  test('save with no existing config creates fresh entry', async () => {
    const { result } = await mount(runtime, container)
    void result.save?.()
    await new Promise<void>((r) => setTimeout(r, 0))
    const stored = runtime.stores[CONFIG_KEY] as { v2ex: { todayMinReplies: number } }
    expect(stored.v2ex.todayMinReplies).toBe(10)
  })
})
