import type { NovelChapterVariant, NovelSourceState } from './types'

export function rewriteHost(url: string, newHost: string): string {
  try {
    const u = new URL(url)
    u.hostname = newHost
    return u.href
  } catch {
    return url
  }
}

/**
 * Rewrite a chapter variant's url to the host that actually served its source
 * pages (the mirror), while the canonical (entry) url stays the variant's
 * identity. Falls back to the original url when no mirror host is recorded.
 */
export function variantUrl(v: NovelChapterVariant): string {
  if (!v.host) return v.url
  return rewriteHost(v.url, v.host)
}

/** Rewrite a source's home url to the mirror host recorded for it. */
export function sourceUrl(source: NovelSourceState): string {
  if (!source.mirrorHost) return source.url
  return rewriteHost(source.url, source.mirrorHost)
}

/** Short label for a source: the registrable name's first label, sans `www.`. */
export function sourceLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname
    const bare = hostname.replace(/^www\./, '')
    const first = bare.split('.')[0]
    return first || bare
  } catch {
    return url
  }
}
