import type { Runtime } from '../../runtime'
import type { Source } from '../types'

export function bootstrapSync(runtime: Runtime, sources: Source<unknown>[]): void {
  const syncDomains: Array<{ hostMatch: (h: string) => boolean; id: string }> = [
    {
      hostMatch: (h) => h === 'v2ex.com' || h.endsWith('.v2ex.com'),
      id: 'v2ex',
    },
    {
      hostMatch: (h) => h === 'reddit.com' || h.endsWith('.reddit.com'),
      id: 'reddit',
    },
  ]
  for (const { hostMatch, id } of syncDomains) {
    if (hostMatch(runtime.location.hostname)) {
      const src = sources.find((s) => s.id === id)
      if (src) {
        runtime.requestIdleCallback(() => void src.loadState?.(runtime), { timeout: 10000 })
      }
    }
  }
}
