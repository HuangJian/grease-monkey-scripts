import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createDashboard } from '../../src/prism/app'
import { DEFAULT_CONFIG } from '../../src/prism/config'
import { CACHE_KEY, CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/prism/types'
import { createRuntime, type TestRuntime } from '../runtime'

// ── Timers drive the runtime's fake clock (see test/runtime.ts). ──
// createRuntime() records setTimeout/setInterval in a registry exposed via
// activeTimeouts()/activeIntervals()/runTimeout(); no global monkey-patch.

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
const FOREGROUND_REFRESH_MS = 60_000

// ── Tests ──

describe('dashboard refresh scheduling', () => {
  let runtime: TestRuntime

  beforeEach(() => {
    globalThis.location.href = 'https://www.v2ex.com/'
    runtime = createRuntime()
    runtime.request = ((d) =>
      d.onload({ responseText: '[]', status: 200, responseHeaders: '' })) as typeof runtime.request
    runtime.requestIdleCallback = () => {}
    seedFreshCaches(runtime)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('start() schedules a background setTimeout with 300+random(60)s delay', () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    const bgTimers = runtime.activeTimeouts(BACKGROUND_MIN)
    expect(bgTimers.length).toBe(1)
    expect(bgTimers[0]!.delay).toBeGreaterThanOrEqual(BACKGROUND_MIN)
    expect(bgTimers[0]!.delay).toBeLessThan(BACKGROUND_MAX)
  })

  test('open() clears background timer and starts 60s foreground interval', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    const bgBefore = runtime.activeTimeouts(BACKGROUND_MIN)
    expect(bgBefore.length).toBe(1)

    await dashboard.open()

    // Background timer should be cleared.
    expect(runtime.activeTimeouts(BACKGROUND_MIN).length).toBe(0)
    // Foreground 60s interval should be active.  Component-level
    // useEffects (e.g. RefreshTime self-ticking clock) may also create
    // intervals — filter to the dashboard's own refresh interval.
    const fgIntervals = runtime.activeIntervals().filter((t) => t.delay === FOREGROUND_REFRESH_MS)
    expect(fgIntervals.length).toBe(1)

    dashboard.close()
  })

  test('close() clears foreground interval and resumes background timer', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    // Only check the dashboard's foreground interval (see note above
    // about component-level intervals from preact 10.29.3+).
    expect(runtime.activeIntervals().filter((t) => t.delay === FOREGROUND_REFRESH_MS).length).toBe(
      1,
    )

    dashboard.close()

    // All intervals cleared — both the foreground refresh interval and
    // component-level timers (e.g. RefreshTime self-ticking clock) whose
    // useEffect cleanups fire via render(null, card) during close().
    expect(runtime.activeIntervals().length).toBe(0)
    // Background timer re-scheduled.
    const bgTimers = runtime.activeTimeouts(BACKGROUND_MIN)
    expect(bgTimers.length).toBe(1)
    expect(bgTimers[0]!.delay).toBeLessThan(BACKGROUND_MAX)
  })

  test('background timer re-arms with a new delay after firing', () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    const firstBg = runtime.activeTimeouts(BACKGROUND_MIN)
    expect(firstBg.length).toBe(1)

    // Simulate the background timer firing.
    runtime.runTimeout(firstBg[0]!.id)

    // A new background timer should be scheduled (re-armed).
    const secondBg = runtime.activeTimeouts(BACKGROUND_MIN)
    expect(secondBg.length).toBe(1)
  })

  test('background tick does not trigger when panel is open', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    const firstBg = runtime.activeTimeouts(BACKGROUND_MIN)
    expect(firstBg.length).toBe(1)
    const bgTimerId = firstBg[0]!.id

    await dashboard.open()
    // open() clears the background timer.
    expect(runtime.activeTimeouts(BACKGROUND_MIN).length).toBe(0)

    // Manually fire the old background callback — should NOT re-arm
    // because the panel is open (defensive check).
    runtime.runTimeout(bgTimerId)
    expect(runtime.activeTimeouts(BACKGROUND_MIN).length).toBe(0)

    dashboard.close()
  })
})
