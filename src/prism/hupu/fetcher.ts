import type { Runtime } from '../../runtime'
import { requestText } from '../shared/request'
import { HUPU_USER_AGENT } from './constants'
import { buildBoardUrl, mergeHupuPosts, parseHupuDataJson, parseHupuDom } from './parser'
import type { HupuFetchResult, HupuPost, HupuSourceOptions } from './types'

type FetchOutcome = { posts: HupuPost[]; error?: string }

async function fetchOneBoard(
  runtime: Runtime,
  board: string,
  domParser: DOMParser,
): Promise<FetchOutcome> {
  const url = buildBoardUrl(board)
  console.debug('[gm-dashboard] hupu.fetchOneBoard board=', board, 'url=', url)
  let html: string
  try {
    // shared/request rejects on status>=400 / network error / timeout (15s default),
    // surfacing them as a failed outcome — identical to the prior inline behavior.
    html = await requestText(runtime, url, {
      anonymous: true,
      headers: { 'User-Agent': HUPU_USER_AGENT },
    })
  } catch (e) {
    return { posts: [], error: e instanceof Error ? e.message : String(e) }
  }
  try {
    const dataJsonMatch = html.match(/window\.\$\$data\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)
    let jsonPosts: HupuPost[] = []
    if (dataJsonMatch) {
      const json: unknown = JSON.parse(dataJsonMatch[1]!)
      jsonPosts = parseHupuDataJson(json, board, 100, runtime.now)
    }
    const domPosts = parseHupuDom(html, board, 100, domParser, runtime.now)
    const merged = mergeHupuPosts(jsonPosts, domPosts)
    return { posts: merged }
  } catch (e) {
    return { posts: [], error: e instanceof Error ? e.message : String(e) }
  }
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
