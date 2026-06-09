import type { Runtime } from '../../runtime'
import { HOT_API_BASE, HOT_PAGE_URL } from './constants'
import {
  dynamicV2exCount,
  mergeV2exTopics,
  parseV2ex,
  parseV2exHotPage,
  sortByDecayedScore,
} from './parser'
import type { V2exState } from './state'
import type { V2exCountOptions, V2exTopic } from './types'

type FetchOutcome = { topics: V2exTopic[]; error?: string }

function fetchFromEndpoint(
  runtime: Runtime,
  url: string,
  parse: (body: string) => V2exTopic[],
): Promise<FetchOutcome> {
  return new Promise<FetchOutcome>((resolve) => {
    let settled = false
    const settle = (outcome: FetchOutcome) => {
      if (settled) return
      settled = true
      resolve(outcome)
    }
    runtime.request({
      url,
      method: 'GET',
      timeout: 15000,
      anonymous: true,
      onload(response) {
        try {
          settle({ topics: parse(response.responseText) })
        } catch (e) {
          settle({ topics: [], error: e instanceof Error ? e.message : String(e) })
        }
      },
      onerror: () => settle({ topics: [], error: 'network error' }),
      ontimeout: () => settle({ topics: [], error: 'timeout' }),
    })
  })
}

export async function fetchV2ex(
  runtime: Runtime,
  countOptions: V2exCountOptions,
  domParser: DOMParser,
  state: V2exState,
): Promise<V2exTopic[]> {
  const [apiResult, pageResult, historicalTopics] = await Promise.all([
    fetchFromEndpoint(runtime, `${HOT_API_BASE}?_t=${Date.now()}`, (body) => {
      const json: unknown = JSON.parse(body)
      return parseV2ex(json, Number.POSITIVE_INFINITY)
    }),
    fetchFromEndpoint(runtime, HOT_PAGE_URL, (body) =>
      parseV2exHotPage(body, Number.POSITIVE_INFINITY, domParser),
    ),
    state.loadHistory(runtime),
  ])

  const apiIds = apiResult.topics.map((t) => t.id)
  const pageIds = pageResult.topics.map((t) => t.id)
  console.debug(
    `[v2ex-fetch] api${apiResult.error ? `(err:${apiResult.error})` : ''}: ${apiResult.topics.length} topics ` +
      `[${apiResult.topics
        .slice(0, 5)
        .map((t) => `${t.id}(${t.replies})`)
        .join(',')}]` +
      ` | page${pageResult.error ? `(err:${pageResult.error})` : ''}: ${pageResult.topics.length} topics ` +
      `[${pageResult.topics
        .slice(0, 5)
        .map((t) => `${t.id}(${t.replies})`)
        .join(',')}]` +
      ` | historical: ${historicalTopics.length} topics`,
  )
  console.debug(`[v2ex-fetch] all api IDs: [${apiIds.join(',')}]`)
  console.debug(`[v2ex-fetch] all page IDs: [${pageIds.join(',')}]`)

  if (apiResult.error && pageResult.error) {
    throw new Error(`v2ex api: ${apiResult.error}; v2ex page: ${pageResult.error}`)
  }

  let full = mergeV2exTopics(apiResult.topics, pageResult.topics, false)

  if (historicalTopics.length > 0) {
    const currentIds = new Set(full.map((t) => t.id))
    const historicalAsV2ex: V2exTopic[] = historicalTopics
      .filter((t) => !currentIds.has(t.id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        replies: t.replies,
        member: t.member,
        node: t.node,
        sources: ['api'] as const,
        created: t.created,
      }))
    if (historicalAsV2ex.length > 0) {
      full = mergeV2exTopics(historicalAsV2ex, full, false)
    }
  }

  const now = Date.now()
  full = sortByDecayedScore(full, now, countOptions.ageHalfLifeDays ?? 2)

  if (!apiResult.error) {
    void state.saveHistory(runtime, apiResult.topics)
  }

  console.debug(
    `[v2ex-merge] merged=${full.length} ` +
      `sources=[${full
        .slice(0, 5)
        .map((t) => `${t.id}:${t.sources?.join('+')}`)
        .join(',')}]`,
  )
  console.debug(
    `[v2ex-merge] all merged IDs: [${full.map((t) => `${t.id}:${t.sources?.join('+')}`).join(',')}]`,
  )
  const filtered = full.filter((t) => t.replies >= countOptions.minReplies)
  const replies = filtered.map((t) => t.replies)
  const count = dynamicV2exCount(replies, countOptions)
  console.debug(
    `[v2ex-dynamic] opts=${JSON.stringify(countOptions)} merged=${full.length} filtered=${filtered.length} ` +
      `leader=${replies[0] ?? 0} top10Replies=[${replies.slice(0, 10).join(',')}] ` +
      `finalCount=${count}`,
  )
  console.debug(
    `[v2ex-dynamic] all filtered IDs: [${filtered.map((t) => `${t.id}:${t.replies}`).join(',')}]`,
  )
  return filtered.slice(0, count)
}
