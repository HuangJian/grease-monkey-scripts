import type { Runtime } from '../../runtime'
import { HUPU_USER_AGENT } from './constants'
import { buildBoardUrl, mergeHupuPosts, parseHupuDataJson, parseHupuDom } from './parser'
import type { HupuFetchResult, HupuPost, HupuSourceOptions } from './types'

type FetchOutcome = { posts: HupuPost[]; error?: string }

function fetchOneBoard(
  runtime: Runtime,
  board: string,
  domParser: DOMParser,
): Promise<FetchOutcome> {
  return new Promise<FetchOutcome>((resolve) => {
    let settled = false
    const settle = (outcome: FetchOutcome) => {
      if (settled) return
      settled = true
      resolve(outcome)
    }
    const url = buildBoardUrl(board)
    console.debug('[gm-dashboard] hupu.fetchOneBoard board=', board, 'url=', url)
    runtime.request({
      url,
      method: 'GET',
      timeout: 15000,
      anonymous: true,
      headers: { 'User-Agent': HUPU_USER_AGENT },
      onload(response) {
        if (response.status && response.status >= 400) {
          settle({ posts: [], error: `http ${response.status}` })
          return
        }
        try {
          const html = response.responseText
          const dataJsonMatch = html.match(/window\.\$\$data\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)
          let jsonPosts: HupuPost[] = []
          if (dataJsonMatch) {
            const json: unknown = JSON.parse(dataJsonMatch[1])
            jsonPosts = parseHupuDataJson(json, board, 100)
          }
          const domPosts = parseHupuDom(html, board, 100, domParser)
          const merged = mergeHupuPosts(jsonPosts, domPosts)
          settle({ posts: merged })
        } catch (e) {
          settle({ posts: [], error: e instanceof Error ? e.message : String(e) })
        }
      },
      onerror: () => settle({ posts: [], error: 'network error' }),
      ontimeout: () => settle({ posts: [], error: 'timeout' }),
    })
  })
}

export async function fetchHupu(
  runtime: Runtime,
  options: HupuSourceOptions,
): Promise<HupuFetchResult> {
  const boards = Array.from(new Set(options.boards.filter((b) => b.length > 0)))
  if (boards.length === 0) {
    throw new Error('hupu: no valid boards configured')
  }
  const domParser = new runtime.DOMParser()
  const settled = await Promise.all(
    boards.map(async (board) => {
      const outcome = await fetchOneBoard(runtime, board, domParser)
      if (outcome.error) return { board, posts: [] as HupuPost[], error: outcome.error }
      return { board, posts: outcome.posts, error: null as string | null }
    }),
  )
  const errors: string[] = []
  const perBoard: Array<{ board: string; posts: HupuPost[] }> = []
  settled.forEach((item) => {
    if (item.error) errors.push(`${item.board}: ${item.error}`)
    if (item.posts.length > 0) perBoard.push({ board: item.board, posts: item.posts })
  })
  if (perBoard.length === 0) {
    throw new Error(`hupu: all boards failed: ${errors.join('; ')}`)
  }
  return { boards: perBoard, partialErrors: errors }
}
