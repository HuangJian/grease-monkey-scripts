import { describe, expect, it } from 'bun:test'
import {
  computeRetryDelayMs,
  requestJson,
  requestText,
  requestTextWithHeaders,
} from '../../../src/prism/shared/request'
import { createRuntime, type TestRuntime } from '../../runtime'
import type { Runtime } from '../../../src/runtime'

/**
 * A controllable `request` that replays a scripted list of responses per URL,
 * so we can simulate "429 then 200" or "429 forever" without real network.
 */
function withScriptedRequest(
  runtime: TestRuntime,
  script: Array<{ status: number; text: string; responseHeaders?: string }>,
): void {
  let i = 0
  runtime.request = ((details) => {
    const r = script[i++] ?? { status: 200, text: '', responseHeaders: '' }
    details.onload({
      responseText: r.text,
      status: r.status,
      responseHeaders: r.responseHeaders ?? '',
    })
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

describe('computeRetryDelayMs', () => {
  it('prefers the Retry-After header (delta-seconds)', () => {
    expect(computeRetryDelayMs(0, 'retry-after: 7', undefined)).toBe(7000)
  })

  it('falls back to baseDelayMs when no header', () => {
    expect(computeRetryDelayMs(0, '', 1234)).toBe(1234)
  })

  it('falls back to HTTP_RETRY_DELAYS_MS when neither header nor base', () => {
    // Deliberately seconds, not the minute-scale BACKOFF_DELAYS_MS used for
    // source-level refresh scheduling — a single request must never stall for
    // 60s inside a refresh while holding a concurrency slot (§4.9).
    expect(computeRetryDelayMs(0, '', undefined)).toBe(1_000)
    expect(computeRetryDelayMs(1, '', undefined)).toBe(4_000)
    expect(computeRetryDelayMs(2, '', undefined)).toBe(10_000)
    // Out-of-range attempts clamp to the last rung instead of growing unbounded.
    expect(computeRetryDelayMs(99, '', undefined)).toBe(10_000)
  })
})

describe('requestTextWithHeaders retry', () => {
  it('retries on a retryable status then succeeds', async () => {
    const runtime = createRuntime()
    withScriptedRequest(runtime, [
      { status: 429, text: '' },
      { status: 429, text: '' },
      { status: 200, text: 'ok' },
    ])
    const p = requestTextWithHeaders(runtime, 'https://x/test', {
      retry: { statuses: [429], max: 2 },
    })
    // Drive the fake clock: each retry schedules a backoff timer we must fire.
    drainTimeouts(runtime)
    const res = await p
    expect(res.status).toBe(200)
    expect(res.text).toBe('ok')
  })

  it('rejects after exhausting retries on a retryable status', async () => {
    const runtime = createRuntime()
    withScriptedRequest(runtime, [
      { status: 429, text: '' },
      { status: 429, text: '' },
      { status: 429, text: '' },
    ])
    const p = requestTextWithHeaders(runtime, 'https://x/test', {
      retry: { statuses: [429], max: 2 },
    })
    drainTimeouts(runtime)
    await expect(p).rejects.toThrow('http 429')
  })

  it('does not retry non-listed statuses', async () => {
    const runtime = createRuntime()
    withScriptedRequest(runtime, [{ status: 500, text: '' }])
    await expect(
      requestTextWithHeaders(runtime, 'https://x/test', {
        retry: { statuses: [429], max: 2 },
      }),
    ).rejects.toThrow('http 500')
    // A 500 should not schedule any retry backoff.
    expect(runtime.activeTimeouts().length).toBe(0)
  })
})

describe('retry propagation through requestText / requestJson', () => {
  it('requestJson retries a 429 then resolves the parsed body', async () => {
    const runtime = createRuntime()
    withScriptedRequest(runtime, [
      { status: 429, text: '' },
      { status: 200, text: '{"ok":true}' },
    ])
    const p = requestJson(runtime, 'https://x/test', { retry: { statuses: [429], max: 1 } })
    drainTimeouts(runtime)
    await expect(p).resolves.toEqual({ ok: true })
  })

  it('requestText rejects once retries are exhausted', async () => {
    const runtime = createRuntime()
    withScriptedRequest(runtime, [
      { status: 429, text: '' },
      { status: 429, text: '' },
    ])
    const p = requestText(runtime, 'https://x/test', { retry: { statuses: [429], max: 1 } })
    drainTimeouts(runtime)
    await expect(p).rejects.toThrow('http 429')
  })

  it('schedules a seconds-scale backoff when the server omits Retry-After', async () => {
    const runtime = createRuntime()
    withScriptedRequest(runtime, [
      { status: 429, text: '' },
      { status: 200, text: 'ok' },
    ])
    const p = requestTextWithHeaders(runtime, 'https://x/test', {
      retry: { statuses: [429], max: 1 },
    })
    const pending = runtime.activeTimeouts()
    expect(pending).toHaveLength(1)
    expect(pending[0]!.delay).toBeLessThan(5_000)
    runtime.runTimeout(pending[0]!.id)
    await expect(p).resolves.toMatchObject({ status: 200 })
  })
})
