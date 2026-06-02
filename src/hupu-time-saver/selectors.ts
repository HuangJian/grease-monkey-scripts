export type HupuThreadData = {
  tid: string
  authorPuid: string
  authorPuname: string
  authorEuid: string
  authorUrl: string
  currentPage: number
  pageCount: number
  repliesPerPage: number
}

export type HupuReplyRecord = {
  pid: string
  authorPuid: string
  authorPuname: string
  authorEuid: string
  authorUrl: string
}

export function extractNextData(doc: Document): unknown {
  const script = doc.getElementById('__NEXT_DATA__')
  if (!script) return null
  try {
    return JSON.parse(script.textContent || '')
  } catch {
    return null
  }
}

export function parseNextData(rawJson: unknown): HupuThreadData | null {
  if (rawJson == null || typeof rawJson !== 'object') return null
  const anyJson = rawJson as Record<string, unknown>
  const props = anyJson.props as Record<string, unknown> | undefined
  if (!props) return null
  const pageProps = props.pageProps as Record<string, unknown> | undefined
  if (!pageProps) return null
  const detail = pageProps.detail as Record<string, unknown> | undefined
  if (!detail) return null

  const thread = detail.thread as Record<string, unknown> | undefined
  if (!thread) return null

  const tid = String(thread.tid ?? '')
  if (!tid) return null

  const author = thread.author as Record<string, unknown> | undefined
  if (!author) return null

  const authorPuid = String(author.puid ?? '')
  if (!authorPuid) return null

  const replies = detail.replies as Record<string, unknown> | undefined
  if (!replies) return null

  const pageCount = typeof replies.total === 'number' ? replies.total : Number(replies.total ?? 1)
  const repliesPerPage =
    typeof replies.size === 'number' ? replies.size : Number(replies.size ?? 20)
  const currentPage =
    typeof replies.current === 'number' ? replies.current : Number(replies.current ?? 1)

  return {
    tid,
    authorPuid,
    authorPuname: String(author.puname ?? ''),
    authorEuid: String(author.euid ?? ''),
    authorUrl: String(author.url ?? ''),
    currentPage,
    pageCount,
    repliesPerPage,
  }
}

export function parseReplyList(rawJson: unknown): HupuReplyRecord[] {
  if (rawJson == null || typeof rawJson !== 'object') return []
  const anyJson = rawJson as Record<string, unknown>
  const props = anyJson.props as Record<string, unknown> | undefined
  if (!props) return []
  const pageProps = props.pageProps as Record<string, unknown> | undefined
  if (!pageProps) return []
  const detail = pageProps.detail as Record<string, unknown> | undefined
  if (!detail) return []
  const replies = detail.replies as Record<string, unknown> | undefined
  if (!replies) return []

  const list = replies.list as unknown[] | undefined
  if (!Array.isArray(list)) return []

  const result: HupuReplyRecord[] = []
  for (const item of list) {
    if (item == null || typeof item !== 'object') continue
    const reply = item as Record<string, unknown>
    const author = reply.author as Record<string, unknown> | undefined
    if (!author) continue

    const puid = String(author.puid ?? '')
    const euid = String(author.euid ?? '')
    if (!puid || !euid) continue

    result.push({
      pid: String(reply.pid ?? ''),
      authorPuid: puid,
      authorPuname: String(author.puname ?? ''),
      authorEuid: euid,
      authorUrl: String(author.url ?? ''),
    })
  }
  return result
}

export function findAllAuthorLinks(root: Element): NodeListOf<HTMLAnchorElement> {
  return root.querySelectorAll<HTMLAnchorElement>('a[href*="my.hupu.com"]')
}

export function isAuthorNameLink(el: Element): boolean {
  return (
    el.classList.contains('post-reply-list-user-info-top-name') ||
    Array.from(el.classList).some((c) => c.startsWith('post-user_post-user-comp-info-top-name'))
  )
}

export function extractEuid(href: string): string {
  const protoEnd = href.indexOf('://')
  const start = protoEnd >= 0 ? protoEnd + 3 : 0
  const idx = href.lastIndexOf('/')
  if (idx < start) return ''
  return href.slice(idx + 1).split(/[?#]/)[0]
}

export function buildPageUrl(tid: string, page: number): string {
  return `https://bbs.hupu.com/${tid}-${page}.html`
}
