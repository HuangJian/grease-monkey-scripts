import type { AuthorTagMap } from '../shared/author-labels'
import { parseAuthorTagMap } from '../shared/author-labels'
import type { Runtime } from '../runtime'

export type SyncAuthorTagsOpts = {
  runtime: Runtime
  isDomain: (hostname: string) => boolean
  lsKey: string
  gmKey: string
  fallbackGmKey?: string
  target: { map: AuthorTagMap }
}

export async function syncAuthorTags(opts: SyncAuthorTagsOpts): Promise<void> {
  const { runtime, isDomain, lsKey, gmKey, fallbackGmKey, target } = opts
  try {
    const host = runtime.location.hostname
    if (isDomain(host)) {
      const raw = localStorage.getItem(lsKey)
      if (raw) {
        target.map = parseAuthorTagMap(JSON.parse(raw))
        await runtime.setValue(gmKey, target.map)
        return
      }
    }
    let stored = await runtime.getValue<unknown>(gmKey, null)
    if (stored === null && fallbackGmKey) {
      stored = await runtime.getValue<unknown>(fallbackGmKey, null)
    }
    target.map = stored ? parseAuthorTagMap(stored) : {}
  } catch {
    target.map = {}
  }
}
