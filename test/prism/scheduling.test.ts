import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createDashboard } from '../../src/prism/app'
import { DEFAULT_CONFIG } from '../../src/prism/config'
import { CACHE_KEY, CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/prism/types'
import { createRuntime, type TestRuntime } from '../runtime'

// ── Timer mock ──

type MockTimer = { id: number; delay: number; cb: () => void; type: 'timeout' | 'interval' }

function installTimerMock() {
  const timers: MockTimer[] = []
  const cleared = new Set<number>()
  const fired = new Set<number>()
  let nextId = 1

  const orig = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  }

  globalThis.setTimeout = ((cb: () => void, delay?: number) => {
    const id = nextId++
    timers.push({ id, delay: delay ?? 0, cb, type: 'timeout' })
    return id as unknown as ReturnType<typeof setTimeout>
  }) as typeof setTimeout

  globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
    cleared.add(id as unknown as number)
  }) as typeof clearTimeout

  globalThis.setInterval = ((cb: () => void, delay?: number) => {
    const id = nextId++
    timers.push({ id, delay: delay ?? 0, cb, type: 'interval' })
    return id as unknown as ReturnType<typeof setInterval>
  }) as typeof setInterval

  globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
    cleared.add(id as unknown as number)
  }) as typeof clearInterval

  return {
    timers,
    cleared,
    /** Active (non-cleared, non-fired) setTimeout calls with delay >= minDelay. */
    activeTimeouts: (minDelay = 0) =>
      timers.filter(
        (t) =>
          t.type === 'timeout' && !cleared.has(t.id) && !fired.has(t.id) && t.delay >= minDelay,
      ),
    /** Active (non-cleared) setInterval calls. */
    activeIntervals: () => timers.filter((t) => t.type === 'interval' && !cleared.has(t.id)),
    /** Run a specific timeout callback and mark it as fired. */
    runTimeout: (id: number) => {
      const entry = timers.find((tm) => tm.id === id && tm.type === 'timeout')
      if (entry && !fired.has(entry.id)) {
        fired.add(entry.id)
        entry.cb()
      }
    },
    restore() {
      globalThis.setTimeout = orig.setTimeout
      globalThis.clearTimeout = orig.clearTimeout
      globalThis.setInterval = orig.setInterval
      globalThis.clearInterval = orig.clearInterval
    },
  }
}

// ── Helpers ──

const FRESH_CACHE: CachedSource<unknown> = {
  schemaVersion: CACHE_SCHEMA_VERSION,
  data: null,
  error: '',
  fetchedAt: Date.now(),
}

/** Set fresh caches for all known source IDs to prevent opportunistic refresh. */
function seedFreshCaches(runtime: TestRuntime): void {
  for (const id of [
    'v2ex',
    'weather',
    'novels',
    'reddit',
    'hupu',
    'tnews',
    'xueqiu-news',
    'xueqiu-hot',
    'xit',
    'misc',
  ]) {
    runtime.stores[CACHE_KEY(id)] = FRESH_CACHE
  }
}

const BACKGROUND_MIN = 300_000
const BACKGROUND_MAX = 360_000

// ── Tests ──

describe('dashboard refresh scheduling', () => {
  let runtime: TestRuntime
  let mock: ReturnType<typeof installTimerMock>

  beforeEach(() => {
    globalThis.location.href = 'https://www.v2ex.com/'
    runtime = createRuntime()
    runtime.request = ((d) =>
      d.onload({ responseText: '[]', status: 200, responseHeaders: '' })) as typeof runtime.request
    runtime.requestIdleCallback = () => {}
    seedFreshCaches(runtime)
    mock = installTimerMock()
  })

  afterEach(() => {
    mock.restore()
    document.body.innerHTML = ''
  })

  test('start() schedules a background setTimeout with 300+random(60)s delay', () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    const bgTimers = mock.activeTimeouts(BACKGROUND_MIN)
    expect(bgTimers.length).toBe(1)
    expect(bgTimers[0]!.delay).toBeGreaterThanOrEqual(BACKGROUND_MIN)
    expect(bgTimers[0]!.delay).toBeLessThan(BACKGROUND_MAX)
  })

  test('open() clears background timer and starts 60s foreground interval', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    const bgBefore = mock.activeTimeouts(BACKGROUND_MIN)
    expect(bgBefore.length).toBe(1)

    await dashboard.open()

    // Background timer should be cleared.
    expect(mock.activeTimeouts(BACKGROUND_MIN).length).toBe(0)
    // Foreground 60s interval should be active.
    const intervals = mock.activeIntervals()
    expect(intervals.length).toBe(1)
    expect(intervals[0]!.delay).toBe(60_000)

    dashboard.close()
  })

  test('close() clears foreground interval and resumes background timer', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    expect(mock.activeIntervals().length).toBe(1)

    dashboard.close()

    // Foreground interval cleared.
    expect(mock.activeIntervals().length).toBe(0)
    // Background timer re-scheduled.
    const bgTimers = mock.activeTimeouts(BACKGROUND_MIN)
    expect(bgTimers.length).toBe(1)
    expect(bgTimers[0]!.delay).toBeLessThan(BACKGROUND_MAX)
  })

  test('background timer re-arms with a new delay after firing', () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    const firstBg = mock.activeTimeouts(BACKGROUND_MIN)
    expect(firstBg.length).toBe(1)

    // Simulate the background timer firing.
    mock.runTimeout(firstBg[0]!.id)

    // A new background timer should be scheduled (re-armed).
    const secondBg = mock.activeTimeouts(BACKGROUND_MIN)
    expect(secondBg.length).toBe(1)
  })

  test('background tick does not trigger when panel is open', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    const firstBg = mock.activeTimeouts(BACKGROUND_MIN)
    expect(firstBg.length).toBe(1)
    const bgTimerId = firstBg[0]!.id

    await dashboard.open()
    // open() clears the background timer.
    expect(mock.activeTimeouts(BACKGROUND_MIN).length).toBe(0)

    // Manually fire the old background callback — should NOT re-arm
    // because the panel is open (defensive check).
    mock.runTimeout(bgTimerId)
    expect(mock.activeTimeouts(BACKGROUND_MIN).length).toBe(0)

    dashboard.close()
  })
})
