import type { Runtime } from '../../runtime'
import { requestText } from '../shared/request'
import { HUPU_USER_AGENT } from './constants'
import { buildBoardUrl, mergeHupuPosts, parseHupuDataJson, parseHupuDom } from './parser'
import type { HupuFetchResult, HupuPost, HupuSourceOptions } from './types'

type FetchOutcome = { posts: HupuPost[]; error?: string }

/**
 * Extract the inline `window.$$data = {…}` payload using plain index scans.
 *
 * The previous lazy regex `\{[\s\S]*?\}` re-tried its match at every `}` in the
 * document — on ~1MB of board HTML that is a quadratic backtracking cliff
 * (see frontend.refactor.md §3.5). `indexOf` scans are linear and native.
 *
 * @returns the JSON text, or `null` when the marker / script block is absent.
 */
function extractDataJson(html: string): string | null {
  const marker = 'window.$$data'
  const markerIdx = html.indexOf(marker)
  if (markerIdx < 0) return null
  const eqIdx = html.indexOf('=', markerIdx + marker.length)
  if (eqIdx < 0) return null
  const openIdx = html.indexOf('{', eqIdx)
  if (openIdx < 0) return null
  const scriptEnd = html.indexOf('</script>', openIdx)
  if (scriptEnd < 0) return null
  // The payload ends at the last `}` before `</script>` — this mirrors what the
  // old lazy regex captured, including a trailing `;` outside the group.
  const closeIdx = html.lastIndexOf('}', scriptEnd)
  if (closeIdx <= openIdx) return null
  return html.slice(openIdx, closeIdx + 1)
}

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
    const dataJson = extractDataJson(html)
    let jsonPosts: HupuPost[] = []
    if (dataJson) {
      const json: unknown = JSON.parse(dataJson)
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
