import { describe, expect, test } from 'bun:test'
import { mapLimit } from '../../../src/prism/shared/concurrency'

function defer(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('shared/concurrency mapLimit', () => {
  test('resolves to results in input order', async () => {
    const out = await mapLimit([3, 1, 2], async (n) => n * 10, 2)
    expect(out).toEqual([30, 10, 20])
  })

  test('empty input resolves to empty array', async () => {
    expect(await mapLimit([], async (n: number) => n, 4)).toEqual([])
  })

  test('never exceeds the concurrency limit', async () => {
    let active = 0
    let maxActive = 0
    const start = Date.now()
    await mapLimit(
      Array.from({ length: 12 }, (_, i) => i),
      async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await defer(5)
        active--
      },
      3,
    )
    expect(maxActive).toBeLessThanOrEqual(3)
    expect(maxActive).toBeGreaterThan(0)
    expect(Date.now() - start).toBeGreaterThanOrEqual(5 * (12 / 3) - 5) // ~serial batches
  })

  test('limit is clamped to at least 1', async () => {
    let active = 0
    let maxActive = 0
    await mapLimit(
      Array.from({ length: 5 }, (_, i) => i),
      async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await defer(2)
        active--
      },
      0,
    )
    expect(maxActive).toBe(1)
  })

  test('fail-fast: first rejection rejects the whole call', async () => {
    const order: string[] = []
    const err = await mapLimit(
      [1, 2, 3, 4],
      async (n) => {
        if (n === 2) throw new Error('boom')
        await defer(2)
        order.push(String(n))
        return n
      },
      2,
    ).then(
      () => null,
      (e) => e as Error,
    )
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toBe('boom')
  })

  test('limit >= length still preserves order and completes', async () => {
    const out = await mapLimit([1, 2, 3], async (n) => n + 1, 10)
    expect(out).toEqual([2, 3, 4])
  })
})
