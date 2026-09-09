import { describe, expect, it } from 'bun:test'
import { fetchOpenRouterModels } from '../../../src/prism/misc/openrouter/fetcher'
import type { Runtime } from '../../../src/runtime'
import { createRuntime, type TestRuntime } from '../../runtime'

const MODELS_URL = 'https://openrouter.ai/api/v1/models?category=programming'
const RANKINGS_URL = 'https://openrouter.ai/api/frontend/v1/rankings/models?category=programming'
const EMPTY_BODY = '{"data":[]}'

/**
 * Script responses per URL: each URL walks its own list of statuses, so the
 * assertions stay independent of the order in which `fetchOpenRouterModels`
 * issues its two concurrent requests.
 */
function scriptByUrl(
  runtime: TestRuntime,
  script: Record<string, { statuses: number[]; text: string }>,
): void {
  const seen = new Map<string, number>()
  runtime.request = ((details) => {
    const entry = script[details.url] ?? { statuses: [200], text: EMPTY_BODY }
    const n = seen.get(details.url) ?? 0
    seen.set(details.url, n + 1)
    const status = entry.statuses[Math.min(n, entry.statuses.length - 1)] ?? 200
    details.onload({ responseText: entry.text, status, responseHeaders: '' })
  }) as Runtime['request']
}

/** Fire every recorded (not-yet-fired) backoff timer until the queue drains. */
function drainTimeouts(runtime: TestRuntime): void {
  let guard = 0
  for (;;) {
    const pending = runtime.activeTimeouts()
    if (pending.length === 0) break
    if (guard++ > 100) throw new Error('drainTimeouts: too many timers (possible infinite retry)')
    runtime.runTimeout(pending[0]!.id)
  }
}

describe('fetchOpenRouterModels retry wiring (§4.9)', () => {
  it('recovers when the models endpoint answers 429 first', async () => {
    const runtime = createRuntime()
    scriptByUrl(runtime, {
      [MODELS_URL]: { statuses: [429, 200], text: EMPTY_BODY },
      [RANKINGS_URL]: { statuses: [200], text: EMPTY_BODY },
    })
    const p = fetchOpenRouterModels(runtime)
    drainTimeouts(runtime)
    await expect(p).resolves.toEqual({ models: [], fetchedAt: expect.any(String) })
  })

  it('gives up with http 429 once the single retry is exhausted', async () => {
    const runtime = createRuntime()
    scriptByUrl(runtime, {
      [MODELS_URL]: { statuses: [429, 429], text: EMPTY_BODY },
      [RANKINGS_URL]: { statuses: [200], text: EMPTY_BODY },
    })
    const p = fetchOpenRouterModels(runtime)
    drainTimeouts(runtime)
    await expect(p).rejects.toThrow('http 429')
  })
})
