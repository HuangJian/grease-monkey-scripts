import type { AuthorTagMap } from '../shared/author-labels'
import { parseAuthorTagMap } from '../shared/author-labels'
import type { Runtime } from '../runtime'

export type SyncAuthorTagsOpts = {
  runtime: Runtime
  isDomain: (hostname: string) => boolean
  lsKey: string
  gmKey: string
  fallbackGmKey?: string
}

export async function syncAuthorTags(opts: SyncAuthorTagsOpts): Promise<AuthorTagMap> {
  const { runtime, isDomain, lsKey, gmKey, fallbackGmKey } = opts
  try {
    const host = runtime.location.hostname
    if (isDomain(host)) {
      const raw = localStorage.getItem(lsKey)
      if (raw) {
        const map = parseAuthorTagMap(JSON.parse(raw))
        await runtime.setValue(gmKey, map)
        return map
      }
    }
    let stored = await runtime.getValue<unknown>(gmKey, null)
    if (stored === null && fallbackGmKey) {
      stored = await runtime.getValue<unknown>(fallbackGmKey, null)
    }
    return stored ? parseAuthorTagMap(stored) : {}
  } catch {
    return {}
  }
}
