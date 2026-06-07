import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { createRedditEditor } from '../../../../src/dashboard/reddit/editor'
import { CONFIG_KEY } from '../../../../src/dashboard/types'
import type { RedditSourceOptions } from '../../../../src/dashboard/reddit/types'
import { createRuntime, type TestRuntime } from '../../../runtime'

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><head></head><body></body></html>')
}

const DEFAULTS: RedditSourceOptions = {
  ttlMinutes: 30,
  ageHalfLifeDays: 2,
  subreddits: ['popular'],
  minItems: 10,
  maxItems: 30,
  minPerSub: 1,
  displayRatio: 0.1,
  elbowDropRatio: 0.4,
  minCutoffScore: 500,
}

async function mount(
  runtime: TestRuntime,
  container: HTMLElement,
  options: RedditSourceOptions = DEFAULTS,
): Promise<{ closeCalls: () => number }> {
  let closeCalls = 0
  const editor = createRedditEditor(options)
  await editor(container, { runtime, onRevert: () => {}, close: () => closeCalls++ })
  return { closeCalls: () => closeCalls }
}

describe('createRedditEditor', () => {
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

  test('renders initial subreddits as chips', async () => {
    await mount(runtime, container, { ...DEFAULTS, subreddits: ['funny', 'aww'] })
    const chips = container.querySelectorAll('.gm-sp-re-chip')
    expect(chips.length).toBe(2)
    expect(container.querySelectorAll('.gm-sp-re-chip-label')[0]!.textContent).toBe('r/funny')
    expect(container.querySelectorAll('.gm-sp-re-chip-label')[1]!.textContent).toBe('r/aww')
  })

  test('adds a valid subreddit', async () => {
    await mount(runtime, container)
    const input = container.querySelector('.gm-sp-re-input') as HTMLInputElement
    const addBtn = container.querySelector('.gm-sp-re-add') as HTMLButtonElement
    input.value = 'pics'
    addBtn.click()
    expect(container.querySelectorAll('.gm-sp-re-chip').length).toBe(2)
    expect(container.querySelectorAll('.gm-sp-re-chip-label')[1]!.textContent).toBe('r/pics')
    expect(input.value).toBe('')
  })

  test('Enter on input also adds the subreddit', async () => {
    await mount(runtime, container)
    const input = container.querySelector('.gm-sp-re-input') as HTMLInputElement
    input.value = 'gifs'
    input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    expect(container.querySelectorAll('.gm-sp-re-chip').length).toBe(2)
  })

  test('rejects empty subreddit name', async () => {
    await mount(runtime, container)
    ;(container.querySelector('.gm-sp-re-add') as HTMLButtonElement).click()
    const err = container.querySelector('.gm-sp-re-error') as HTMLElement
    expect(err.hidden).toBe(false)
    expect(err.textContent).toContain('subreddit')
  })

  test('rejects duplicate subreddit', async () => {
    await mount(runtime, container, { ...DEFAULTS, subreddits: ['popular'] })
    const input = container.querySelector('.gm-sp-re-input') as HTMLInputElement
    const addBtn = container.querySelector('.gm-sp-re-add') as HTMLButtonElement
    input.value = 'popular'
    addBtn.click()
    const err = container.querySelector('.gm-sp-re-error') as HTMLElement
    expect(err.textContent).toContain('已在列表中')
  })

  test('removes a subreddit when the × button is clicked', async () => {
    await mount(runtime, container, { ...DEFAULTS, subreddits: ['a', 'b', 'c'] })
    const removeBtns = container.querySelectorAll<HTMLButtonElement>('.gm-sp-re-chip-remove')
    removeBtns[1]!.click()
    expect(container.querySelectorAll('.gm-sp-re-chip').length).toBe(2)
    expect(container.querySelectorAll('.gm-sp-re-chip-label')[0]!.textContent).toBe('r/a')
    expect(container.querySelectorAll('.gm-sp-re-chip-label')[1]!.textContent).toBe('r/c')
  })

  test('cancel calls close', async () => {
    const handle = await mount(runtime, container)
    ;(container.querySelector('.gm-sp-re-cancel') as HTMLButtonElement).click()
    expect(handle.closeCalls()).toBe(1)
  })

  test('save persists reddit config and preserves other sections', async () => {
    runtime.stores[CONFIG_KEY] = {
      weather: { cities: [{ latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' }], ttlMinutes: 60 },
      novels: {
        entries: [{ url: 'https://www.sudugu.org/166/' }],
        ttlMinutes: 60,
        initialNewChapters: 3,
        maxNewChaptersPerBook: 5,
        maxLatestWindow: 50,
      },
    }
    await mount(runtime, container)
    ;(container.querySelector('.gm-sp-re-save') as HTMLButtonElement).click()
    await new Promise<void>((r) => setTimeout(r, 0))
    const stored = runtime.stores[CONFIG_KEY] as Record<string, unknown>
    expect(stored['weather']).toBeDefined()
    expect(stored['novels']).toBeDefined()
    const reddit = stored['reddit'] as { subreddits: string[]; ttlMinutes: number }
    expect(reddit.subreddits).toEqual(['popular'])
    expect(reddit.ttlMinutes).toBe(30)
  })

  test('save rejects when subreddits list is empty', async () => {
    await mount(runtime, container, { ...DEFAULTS, subreddits: [] })
    ;(container.querySelector('.gm-sp-re-save') as HTMLButtonElement).click()
    const err = container.querySelector('.gm-sp-re-error') as HTMLElement
    expect(err.hidden).toBe(false)
    expect(err.textContent).toContain('subreddit')
    expect(runtime.stores[CONFIG_KEY]).toBeUndefined()
  })

  test('save rejects invalid TTL', async () => {
    await mount(runtime, container)
    const ttl = container.querySelector('.gm-sp-re-ttl') as HTMLInputElement
    ttl.value = '0'
    ;(container.querySelector('.gm-sp-re-save') as HTMLButtonElement).click()
    const err = container.querySelector('.gm-sp-re-error') as HTMLElement
    expect(err.textContent).toContain('TTL')
    expect(runtime.stores[CONFIG_KEY]).toBeUndefined()
  })

  test('save rejects when maxItems < minItems', async () => {
    await mount(runtime, container, { ...DEFAULTS, minItems: 20, maxItems: 30 })
    const min = container.querySelector('.gm-sp-re-min') as HTMLInputElement
    const max = container.querySelector('.gm-sp-re-max') as HTMLInputElement
    min.value = '25'
    max.value = '10'
    ;(container.querySelector('.gm-sp-re-save') as HTMLButtonElement).click()
    const err = container.querySelector('.gm-sp-re-error') as HTMLElement
    expect(err.textContent).toContain('最多条数')
  })

  test('load reads fresh subreddits from CONFIG_KEY when present', async () => {
    runtime.stores[CONFIG_KEY] = {
      reddit: { ...DEFAULTS, subreddits: ['fromStorage'] },
    }
    await mount(runtime, container, { ...DEFAULTS, subreddits: ['fallback'] })
    expect(container.querySelectorAll('.gm-sp-re-chip-label')[0]!.textContent).toBe('r/fromstorage')
  })

  test('prefills number fields with fresh options', async () => {
    await mount(runtime, container, {
      ...DEFAULTS,
      ttlMinutes: 45,
      minItems: 7,
      maxItems: 25,
      minPerSub: 2,
      displayRatio: 0.2,
      elbowDropRatio: 0.5,
      minCutoffScore: 300,
      ageHalfLifeDays: 3,
    })
    expect((container.querySelector('.gm-sp-re-ttl') as HTMLInputElement).value).toBe('45')
    expect((container.querySelector('.gm-sp-re-min') as HTMLInputElement).value).toBe('7')
    expect((container.querySelector('.gm-sp-re-max') as HTMLInputElement).value).toBe('25')
    expect((container.querySelector('.gm-sp-re-minpersub') as HTMLInputElement).value).toBe('2')
    expect((container.querySelector('.gm-sp-re-ratio') as HTMLInputElement).value).toBe('0.2')
    expect((container.querySelector('.gm-sp-re-elbow') as HTMLInputElement).value).toBe('0.5')
    expect((container.querySelector('.gm-sp-re-cutoff') as HTMLInputElement).value).toBe('300')
    expect((container.querySelector('.gm-sp-re-half-life') as HTMLInputElement).value).toBe('3')
  })

  test('saves ageHalfLifeDays to config', async () => {
    await mount(runtime, container)
    const halfLife = container.querySelector('.gm-sp-re-half-life') as HTMLInputElement
    halfLife.value = '5'
    ;(container.querySelector('.gm-sp-re-save') as HTMLButtonElement).click()
    await new Promise<void>((r) => setTimeout(r, 0))
    const stored = runtime.stores[CONFIG_KEY] as Record<string, { ageHalfLifeDays: number }>
    expect(stored['reddit']!.ageHalfLifeDays).toBe(5)
  })

  test('rejects ageHalfLifeDays out of range', async () => {
    await mount(runtime, container)
    const halfLife = container.querySelector('.gm-sp-re-half-life') as HTMLInputElement
    halfLife.value = '50'
    ;(container.querySelector('.gm-sp-re-save') as HTMLButtonElement).click()
    const err = container.querySelector('.gm-sp-re-error') as HTMLElement
    expect(err.textContent).toContain('衰减半衰期')
    expect(runtime.stores[CONFIG_KEY]).toBeUndefined()
  })

  test('reorder chips via drag updates state and re-renders', async () => {
    await mount(runtime, container, { ...DEFAULTS, subreddits: ['a', 'b', 'c'] })
    const labelsBefore = Array.from(
      container.querySelectorAll<HTMLElement>('.gm-sp-re-chip-label'),
    ).map((el) => el.textContent)
    expect(labelsBefore).toEqual(['r/a', 'r/b', 'r/c'])

    const chips = container.querySelectorAll<HTMLElement>('.gm-sp-re-chip')
    const sourceChip = chips[0]!
    const targetChip = chips[2]!
    const handle = sourceChip.querySelector('.gm-sp-re-chip-drag')!

    const down = new dom.window.PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 0,
      clientY: 0,
    })
    handle.dispatchEvent(down)

    const rect = targetChip.getBoundingClientRect()
    const move = new dom.window.PointerEvent('pointermove', {
      bubbles: true,
      clientX: 0,
      clientY: rect.bottom + 5,
    })
    dom.window.document.dispatchEvent(move)

    const up = new dom.window.PointerEvent('pointerup', { bubbles: true })
    dom.window.document.dispatchEvent(up)

    const labelsAfter = Array.from(
      container.querySelectorAll<HTMLElement>('.gm-sp-re-chip-label'),
    ).map((el) => el.textContent)
    expect(labelsAfter).toEqual(['r/b', 'r/c', 'r/a'])
  })
})
