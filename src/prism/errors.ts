/**
 * Error thrown by a source's `fetch()` when the current tab cannot perform
 * the fetch (e.g. wrong host). `refreshSource` catches this and skips the
 * cache update entirely — no lock steal, no stale `fetchedAt`, no error
 * written to cache. The lock is released so a tab on the correct host can
 * acquire it immediately.
 */
export class SkipRefreshError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkipRefreshError'
  }
}
