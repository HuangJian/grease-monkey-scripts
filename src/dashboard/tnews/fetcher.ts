import type { Runtime } from '../../runtime'
import { RSSHUB_HOST, USER_AGENT } from './constants'
import { parseRssItems } from './parser'
import type { TnewsFetchResult, TnewsItem, TnewsSourceOptions } from './types'

type FeedOutcome = { items: TnewsItem[]; error: string | null }

function withMirror(url: string, mirror: string): string {
  const u = new URL(url)
  u.hostname = mirror
  return u.toString()
}

function fetchOnce(runtime: Runtime, url: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    runtime.request({
      url,
      method: 'GET',
      timeout: 15000,
      anonymous: false,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      onload(response) {
        if (response.status && response.status >= 400) {
          reject(new Error(`http ${response.status}`))
          return
        }
        resolve(response.responseText)
      },
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    })
  })
}

function buildCandidates(url: string, mirrors: ReadonlyArray<string>): string[] {
  const out: string[] = [url]
  try {
    const parsed = new URL(url)
    if (parsed.hostname === RSSHUB_HOST) {
      for (const mirror of mirrors) {
        const mirrored = withMirror(url, mirror)
        if (!out.includes(mirrored)) out.push(mirrored)
      }
    }
  } catch {
    /* ignore */
  }
  return out
}

async function fetchOneFeed(
  runtime: Runtime,
  url: string,
  mirrors: ReadonlyArray<string>,
): Promise<FeedOutcome> {
  const candidates = buildCandidates(url, mirrors)
  let lastError: Error | null = null
  for (const candidate of candidates) {
    try {
      const text = await fetchOnce(runtime, candidate)
      const items = parseRssItems(text, new runtime.DOMParser())
      console.debug('[gm-tnews] feed try url=', candidate, 'outcome=ok count=', items.length)
      return { items, error: null }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      console.debug('[gm-tnews] feed try url=', candidate, 'outcome=fail err=', lastError.message)
    }
  }
  return {
    items: [],
    error: lastError ? lastError.message : 'unknown',
  }
}

export async function fetchTnews(
  runtime: Runtime,
  options: Pick<TnewsSourceOptions, 'feeds' | 'mirrors'>,
): Promise<TnewsFetchResult> {
  if (options.feeds.length === 0) {
    throw new Error('tnews: no feeds configured')
  }
  const settled = await Promise.all(
    options.feeds.map((feed) => fetchOneFeed(runtime, feed, options.mirrors)),
  )
  const errors: string[] = []
  const allItems: TnewsItem[] = []
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]!
    if (outcome.error) {
      const feedLabel = options.feeds[i] ?? '<unknown>'
      errors.push(`${feedLabel}: ${outcome.error}`)
    }
    for (const it of outcome.items) allItems.push(it)
  }
  if (allItems.length === 0 && errors.length > 0) {
    throw new Error(`tnews: all feeds failed: ${errors.join('; ')}`)
  }
  allItems.sort((a, b) => b.pubDate - a.pubDate)
  return { items: allItems, errors }
}
