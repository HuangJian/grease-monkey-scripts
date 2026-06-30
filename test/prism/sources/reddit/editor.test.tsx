import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, waitFor, within } from '@testing-library/preact'
import { createRedditEditor } from '../../../../src/prism/reddit/editor/form'
import { CONFIG_KEY, DEFAULT_SOURCE_SETTINGS } from '../../../../src/prism/types'
import type { RedditSourceOptions } from '../../../../src/prism/reddit/types'
import { createRuntime, type TestRuntime } from '../../../runtime'

const DEFAULTS: RedditSourceOptions = {
  ttlMinutes: 30,
  retentionDays: 7,
  todayMinComments: 10,
  olderMinComments: 20,
  ageHalfLifeDays: 2,
  subreddits: ['popular'],
}

async function mount(
  runtime: TestRuntime,
  container: HTMLElement,
  options: RedditSourceOptions = DEFAULTS,
) {
  let closeCalls = 0
  const editor = createRedditEditor(options, DEFAULT_SOURCE_SETTINGS)
  const result = await editor(container, { runtime, onRevert: () => {}, close: () => closeCalls++ })
  return { closeCalls: () => closeCalls, result }
}

describe('createRedditEditor', () => {
  let runtime: TestRuntime
  let container: HTMLElement

  beforeEach(() => {
    runtime = createRuntime()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
  })

  test('renders initial subreddits as chips', async () => {
    await mount(runtime, container, { ...DEFAULTS, subreddits: ['funny', 'aww'] })
    expect(within(container).getByText('r/funny')).not.toBeNull()
    expect(within(container).getByText('r/aww')).not.toBeNull()
  })

  test('adds a valid subreddit', async () => {
    await mount(runtime, container)
    const input = within(container).getByPlaceholderText(/r\/funny/) as HTMLInputElement
    const addBtn = within(container).getByRole('button', { name: '添加' }) as HTMLButtonElement
    input.value = 'pics'
    addBtn.click()
    expect(within(container).getByText('r/popular')).not.toBeNull()
    expect(within(container).getByText('r/pics')).not.toBeNull()
    expect(input.value).toBe('')
  })

  test('Enter on input also adds the subreddit', async () => {
    await mount(runtime, container)
    const input = within(container).getByPlaceholderText(/r\/funny/) as HTMLInputElement
    input.value = 'gifs'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    expect(within(container).getByText('r/gifs')).not.toBeNull()
  })

  test('rejects empty subreddit name', async () => {
    await mount(runtime, container)
    ;(within(container).getByRole('button', { name: '添加' }) as HTMLButtonElement).click()
    expect(within(container).getByText('请输入有效的 subreddit 名称')).not.toBeNull()
  })

  test('rejects duplicate subreddit', async () => {
    await mount(runtime, container, { ...DEFAULTS, subreddits: ['popular'] })
    const input = within(container).getByPlaceholderText(/r\/funny/) as HTMLInputElement
    const addBtn = within(container).getByRole('button', { name: '添加' }) as HTMLButtonElement
    input.value = 'popular'
    addBtn.click()
    expect(within(container).getByText(/已在列表中/)).not.toBeNull()
  })

  test('removes a subreddit when the × button is clicked', async () => {
    await mount(runtime, container, { ...DEFAULTS, subreddits: ['a', 'b', 'c'] })
    const removeBtns = within(container).getAllByRole('button', { name: 'remove' })
    removeBtns[1]!.click()
    expect(within(container).queryAllByRole('button', { name: 'remove' }).length).toBe(2)
    expect(within(container).getByText('r/a')).not.toBeNull()
    expect(within(container).getByText('r/c')).not.toBeNull()
    expect(within(container).queryByText('r/b')).toBeNull()
  })

  test('cancel calls close', async () => {
    const handle = await mount(runtime, container)
    handle.result.cancel?.()
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
    const { result } = await mount(runtime, container)
    void result.save?.()
    await waitFor(() => {
      const stored = runtime.stores[CONFIG_KEY] as Record<string, unknown>
      expect(stored['weather']).toBeDefined()
      expect(stored['novels']).toBeDefined()
      const reddit = stored['reddit'] as { subreddits: string[]; ttlMinutes: number }
      expect(reddit.subreddits).toEqual(['popular'])
      expect(reddit.ttlMinutes).toBe(30)
    })
  })

  test('save rejects when subreddits list is empty', async () => {
    const { result } = await mount(runtime, container, { ...DEFAULTS, subreddits: [] })
    void result.save?.()
    expect(within(container).getByText('至少添加一个 subreddit')).not.toBeNull()
    expect(runtime.stores[CONFIG_KEY]).toBeUndefined()
  })

  const inputs = (c: HTMLElement) =>
    within(c.querySelector('.gm-sp-editor-form') as HTMLElement).queryAllByRole('spinbutton')

  test('save rejects invalid TTL', async () => {
    const { result } = await mount(runtime, container)
    const ns = inputs(container)
    ;(ns[0] as HTMLInputElement).value = '0'
    void result.save?.()
    expect(within(container).getByText('TTL 必须是 ≥1 的整数')).not.toBeNull()
    expect(runtime.stores[CONFIG_KEY]).toBeUndefined()
  })

  test('load reads fresh subreddits from CONFIG_KEY when present', async () => {
    runtime.stores[CONFIG_KEY] = {
      reddit: { ...DEFAULTS, subreddits: ['fromStorage'] },
    }
    await mount(runtime, container, { ...DEFAULTS, subreddits: ['fallback'] })
    expect(within(container).getByText('r/fromstorage')).not.toBeNull()
  })

  test('prefills number fields with fresh options', async () => {
    await mount(runtime, container, {
      ...DEFAULTS,
      ttlMinutes: 45,
      todayMinComments: 5,
      olderMinComments: 15,
      ageHalfLifeDays: 3,
    })
    const ns = inputs(container)
    expect((ns[0] as HTMLInputElement).value).toBe('45')
    expect((ns[2] as HTMLInputElement).value).toBe('5')
    expect((ns[3] as HTMLInputElement).value).toBe('15')
    expect((ns[4] as HTMLInputElement).value).toBe('3')
  })

  test('saves ageHalfLifeDays to config', async () => {
    const { result } = await mount(runtime, container)
    const halfLife = inputs(container)[4] as HTMLInputElement
    halfLife.value = '5'
    void result.save?.()
    await waitFor(() => {
      const stored = runtime.stores[CONFIG_KEY] as Record<string, { ageHalfLifeDays: number }>
      expect(stored['reddit']!.ageHalfLifeDays).toBe(5)
    })
  })

  test('rejects ageHalfLifeDays out of range', async () => {
    const { result } = await mount(runtime, container)
    const halfLife = inputs(container)[4] as HTMLInputElement
    halfLife.value = '50'
    void result.save?.()
    expect(within(container).getByText('衰减半衰期必须是 0.1~30 之间')).not.toBeNull()
    expect(runtime.stores[CONFIG_KEY]).toBeUndefined()
  })

  test('reorder chips via move buttons updates state and re-renders', async () => {
    await mount(runtime, container, { ...DEFAULTS, subreddits: ['a', 'b', 'c'] })
    const labelsBefore = within(container)
      .getAllByText(/r\//)
      .map((el) => el.textContent)
    expect(labelsBefore).toEqual(['r/a', 'r/b', 'r/c'])

    const moveDownBtns = within(container).getAllByRole('button', { name: 'move down' })
    moveDownBtns[0]!.click()

    const labelsAfter = within(container)
      .getAllByText(/r\//)
      .map((el) => el.textContent)
    expect(labelsAfter).toEqual(['r/b', 'r/a', 'r/c'])

    const moveUpBtns = within(container).getAllByRole('button', { name: 'move up' })
    moveUpBtns[2]!.click()

    const labelsFinal = within(container)
      .getAllByText(/r\//)
      .map((el) => el.textContent)
    expect(labelsFinal).toEqual(['r/b', 'r/c', 'r/a'])
  })
})
