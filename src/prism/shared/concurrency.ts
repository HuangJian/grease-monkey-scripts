/**
 * Bounded-concurrency async helpers for the prism dashboard.
 *
 * Several fetchers fan out over many URLs with a bare `Promise.all(array.map(...))`,
 * firing every request at once (see frontend.refactor.md P2: "全局无并发控制").
 * `mapLimit` bounds how many mappers run at once while preserving input order
 * and Promise.all-style fail-fast (the first rejection rejects the whole call).
 *
 * Mappers are expected not to mutate shared state across indices without their
 * own synchronization; `mapLimit` only controls scheduling, not side effects.
 */

/**
 * Map `items` through an async `mapper`, running at most `limit` mappers
 * concurrently. Resolves to an array of results in the original item order.
 *
 * Semantics mirror `Promise.all`: if any mapper rejects, the returned promise
 * rejects with that error and no further items are scheduled (in-flight mappers
 * are left to finish, but their results are discarded). `limit` is clamped to
 * at least 1, so `mapLimit(items, f, 0)` still runs everything, just serially.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  limit: number,
): Promise<R[]> {
  if (items.length === 0) return []
  const n = Math.max(1, Math.floor(limit))
  const results = new Array<R>(items.length)
  let cursor = 0
  let finished = 0
  let settled = false

  return new Promise<R[]>((resolve, reject) => {
    const worker = async (): Promise<void> => {
      while (cursor < items.length && !settled) {
        const index = cursor++
        const item = items[index]!
        try {
          results[index] = await mapper(item, index)
        } catch (err) {
          if (!settled) {
            settled = true
            reject(err)
          }
          return
        }
        finished++
        if (finished === items.length && !settled) resolve(results)
      }
    }
    for (let i = 0; i < Math.min(n, items.length); i++) void worker()
  })
}
