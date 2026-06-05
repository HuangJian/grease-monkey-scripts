import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { createV2exEditor } from '../../../src/dashboard/v2ex/editor'
import type { V2exSourceOptions } from '../../../src/dashboard/v2ex/source'
import { CONFIG_KEY } from '../../../src/dashboard/types'
import { createRuntime, type TestRuntime } from '../../runtime'

const DEFAULTS: V2exSourceOptions = {
  ttlMinutes: 30,
  minItems: 10,
  maxItems: 30,
  displayRatio: 0.1,
  elbowDropRatio: 0.4,
  minCutoffReplies: 5,
}

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><head></head><body></body></html>')
}

async function mount(
  runtime: TestRuntime,
  container: HTMLElement,
  options: V2exSourceOptions = DEFAULTS,
): Promise<{ closeCalls: () => number }> {
  let closeCalls = 0
  const editor = createV2exEditor(options)
  await editor(container, { runtime, onRevert: () => {}, close: () => closeCalls++ })
  return { closeCalls: () => closeCalls }
}

describe('createV2exEditor', () => {
  let dom: JSDOM
  let runtime: TestRuntime
  let container: HTMLElement

  beforeEach(() => {
    dom = makeDom()
    runtime = createRuntime(dom)
    container = dom.window.document.createElement('div')
    dom.window.document.body.appendChild(container)
  })

  afterEach(() => {
    dom.window.document.body.innerHTML = ''
  })

  test('cancel calls close', async () => {
    const handle = await mount(runtime, container)
    ;(container.querySelector('.gm-sp-v2e-cancel') as HTMLButtonElement).click()
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
    await mount(runtime, container)
    ;(container.querySelector('.gm-sp-v2e-save') as HTMLButtonElement).click()
    await new Promise<void>((r) => setTimeout(r, 0))
    const stored = runtime.stores[CONFIG_KEY] as Record<string, unknown>
    expect(stored['weather']).toBeDefined()
    expect(stored['novels']).toBeDefined()
    expect(stored['reddit']).toBeDefined()
    expect((stored['weather'] as { cities: unknown[] }).cities).toHaveLength(1)
    expect((stored['reddit'] as { subreddits: string[] }).subreddits).toEqual(['popular', 'aww'])
    expect((stored['v2ex'] as { minItems: number }).minItems).toBe(10)
  })

  test('save with no existing config creates fresh entry', async () => {
    await mount(runtime, container)
    ;(container.querySelector('.gm-sp-v2e-save') as HTMLButtonElement).click()
    await new Promise<void>((r) => setTimeout(r, 0))
    const stored = runtime.stores[CONFIG_KEY] as { v2ex: { minItems: number } }
    expect(stored.v2ex.minItems).toBe(10)
  })

  test('shows validation error when maxItems < minItems', async () => {
    await mount(runtime, container, { ...DEFAULTS, minItems: 5, maxItems: 30 })
    const minInput = container.querySelector('.gm-sp-v2e-min') as HTMLInputElement
    const maxInput = container.querySelector('.gm-sp-v2e-max') as HTMLInputElement
    minInput.value = '10'
    maxInput.value = '5'
    ;(container.querySelector('.gm-sp-v2e-save') as HTMLButtonElement).click()
    const errorEl = container.querySelector('.gm-sp-v2e-error') as HTMLDivElement
    expect(errorEl.hidden).toBe(false)
    expect(errorEl.textContent).toMatch(/最多条数/)
    expect(runtime.stores[CONFIG_KEY]).toBeUndefined()
  })
})
