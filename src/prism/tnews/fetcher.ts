import type { Runtime } from '../../runtime'
import { requestText } from '../shared/request'
import { TNEWS_FEED_URL, USER_AGENT } from './constants'
import { parseRssItems } from './parser'
import type { TnewsFetchResult, TnewsItem } from './types'

type FeedOutcome = { items: TnewsItem[]; error: string | null }

function fetchOnce(runtime: Runtime, url: string): Promise<string> {
  // shared/request rejects on status>=400 / network error / timeout (15s default),
  // matching the previous inline behavior.
  return requestText(runtime, url, {
    anonymous: false,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  })
}

async function fetchOneFeed(runtime: Runtime, url: string): Promise<FeedOutcome> {
  try {
    const text = await fetchOnce(runtime, url)
    const items = parseRssItems(text, new runtime.DOMParser())
    console.debug('[gm-tnews] feed url=', url, 'count=', items.length)
    return { items, error: null }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.debug('[gm-tnews] feed url=', url, 'fail err=', err.message)
    return { items: [], error: err.message }
  }
}

export async function fetchTnews(runtime: Runtime): Promise<TnewsFetchResult> {
  const feeds = [TNEWS_FEED_URL]
  const settled = await Promise.all(feeds.map((feed) => fetchOneFeed(runtime, feed)))
  const errors: string[] = []
  const allItems: TnewsItem[] = []
  settled.forEach((outcome, i) => {
    if (outcome.error) {
      const feedLabel = feeds[i] ?? '<unknown>'
      errors.push(`${feedLabel}: ${outcome.error}`)
    }
    outcome.items.forEach((it) => allItems.push(it))
  })
  if (allItems.length === 0 && errors.length > 0) {
    throw new Error(`tnews: all feeds failed: ${errors.join('; ')}`)
  }
  allItems.sort((a, b) => b.pubDate - a.pubDate)
  return { items: allItems, errors }
}
