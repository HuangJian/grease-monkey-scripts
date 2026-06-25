import type { CachedSource } from './types'

const SOURCE_BASE: Record<string, string> = {
  v2ex: 'https://www.v2ex.com',
  reddit: 'https://www.reddit.com',
  hupu: 'https://bbs.hupu.com',
  'xueqiu-news': 'https://xueqiu.com',
  'xueqiu-hot': 'https://xueqiu.com',
}

function stripDomain(sourceId: string, u: string): string {
  const base = SOURCE_BASE[sourceId]
  if (!base || !u.startsWith(base)) return u
  return u.slice(base.length)
}

function compressTimestamp(v: number | undefined): number | undefined {
  if (v === undefined) return v
  return Math.floor(v / 60000)
}

function expandTimestamp(v: number | undefined): number | undefined {
  if (v === undefined) return v
  if (v < 1e9) return v * 60000
  return v
}

function expandUrl(sourceId: string, u: string): string {
  const base = SOURCE_BASE[sourceId]
  if (
    base &&
    typeof u === 'string' &&
    !u.startsWith('http://') &&
    !u.startsWith('https://') &&
    !u.startsWith('//')
  ) {
    return base + u
  }
  return u
}

function isShortItem(v: Record<string, unknown>): boolean {
  return typeof v.t === 'string'
}

// V2EX
function compressV2ex(v: Record<string, unknown>): Record<string, unknown> {
  if (isShortItem(v)) return v
  const m = v.member as Record<string, unknown> | undefined
  const n = v.node as Record<string, unknown> | undefined
  const out: Record<string, unknown> = {
    id: v.id,
    t: v.title,
    u: stripDomain('v2ex', String(v.url ?? '')),
    r: v.replies,
  }
  if (m && typeof m.username === 'string') out.a = m.username
  if (n && typeof n.title === 'string') out.nt = n.title
  if (Array.isArray(v.sources) && v.sources.length > 0) out.sr = v.sources
  if (typeof v.created === 'number' && v.created > 0) out.c = compressTimestamp(v.created)
  return out
}

function expandV2ex(v: Record<string, unknown>): Record<string, unknown> {
  if (v.title !== undefined) return v
  const out: Record<string, unknown> = {
    id: v.id,
    title: v.t,
    url: expandUrl('v2ex', String(v.u ?? '')),
    replies: v.r,
    member: { username: v.a ?? '' },
    node: { title: v.nt ?? '' },
    sources: v.sr ?? [],
    created: expandTimestamp(v.c as number | undefined) ?? 0,
  }
  return out
}

// Reddit
function compressReddit(v: Record<string, unknown>): Record<string, unknown> {
  if (isShortItem(v)) return v
  return {
    id: v.id,
    t: v.title,
    u: stripDomain('reddit', String(v.url ?? '')),
    s: v.score ?? v.s,
    r: v.numComments ?? v.r,
    a: v.author,
    c: compressTimestamp((v.created ?? v.c) as number | undefined),
  }
}

function expandReddit(v: Record<string, unknown>): Record<string, unknown> {
  if (v.title !== undefined) return v
  return {
    id: v.id,
    title: v.t,
    url: expandUrl('reddit', String(v.u ?? '')),
    score: v.s ?? 0,
    numComments: v.r ?? 0,
    subreddits: (v.subreddits as string[]) ?? [],
    author: v.a ?? '',
    created: expandTimestamp(v.c as number | undefined) ?? 0,
  }
}

// Hupu
function compressHupu(v: Record<string, unknown>): Record<string, unknown> {
  if (isShortItem(v)) return v
  return {
    id: v.id,
    t: v.title ?? v.t,
    u: stripDomain('hupu', String(v.url ?? '')),
    l: v.lights ?? v.l,
    r: v.replies ?? v.r,
    a: v.author ?? v.a,
    c: compressTimestamp((v.created ?? v.c) as number | undefined),
  }
}

function expandHupu(v: Record<string, unknown>): Record<string, unknown> {
  if (v.title !== undefined) return v
  const out: Record<string, unknown> = {
    id: v.id,
    title: v.t ?? '',
    url: expandUrl('hupu', String(v.u ?? '')),
    lights: v.l ?? 0,
    replies: v.r ?? 0,
    author: v.a ?? '',
    created: expandTimestamp(v.c as number | undefined) ?? 0,
  }
  if (v.views !== undefined) out.views = v.views
  if (v.authorUrl !== undefined) out.authorUrl = v.authorUrl
  if (v.board !== undefined) out.board = v.board
  if (v.topicName !== undefined) out.topicName = v.topicName
  return out
}

// Xueqiu
function compressXueqiu(v: Record<string, unknown>): Record<string, unknown> {
  if (isShortItem(v)) return v
  const out: Record<string, unknown> = {
    id: v.id,
    t: v.title ?? v.t,
    x: v.text ?? v.x,
    u: String(v.target ?? v.url ?? '').replace(/^https?:\/\/xueqiu\.com/, ''),
    c: compressTimestamp((v.created_at ?? v.c) as number | undefined),
    r: v.reply_count ?? v.r,
  }
  if (typeof v.like_count === 'number' && v.like_count > 0) out.lc = v.like_count
  const desc = String(v.description ?? v.d ?? '')
  const text = String(v.text ?? v.x ?? '')
  if (desc !== text) out.d = desc
  return out
}

function expandXueqiu(v: Record<string, unknown>): Record<string, unknown> {
  if (v.title !== undefined) return v
  const out: Record<string, unknown> = {
    id: v.id,
    title: v.t ?? '',
    text: v.x ?? '',
    target: expandUrl('xueqiu-news', String(v.u ?? '')),
    created_at: expandTimestamp(v.c as number | undefined) ?? 0,
    reply_count: v.r ?? 0,
    like_count: v.lc ?? 0,
  }
  if (v.d !== undefined) out.description = v.d
  return out
}

// Tnews
function compressTnews(v: Record<string, unknown>): Record<string, unknown> {
  if (isShortItem(v)) return v
  return {
    id: v.id,
    t: v.title ?? v.t,
    u: v.link ?? v.u,
    c: compressTimestamp((v.pubDate ?? v.c) as number | undefined),
    x: v.descriptionHtml ?? v.x,
  }
}

function expandTnews(v: Record<string, unknown>): Record<string, unknown> {
  if (v.title !== undefined) return v
  return {
    id: v.id,
    title: v.t ?? '',
    link: v.u ?? '',
    pubDate: expandTimestamp(v.c as number | undefined) ?? 0,
    descriptionHtml: v.x ?? '',
  }
}

// Novels
function compressNovelChapter(v: Record<string, unknown>): Record<string, unknown> {
  if (isShortItem(v)) return v
  const out: Record<string, unknown> = { u: v.url ?? v.u, t: v.title ?? v.t }
  if (typeof v.postedAt === 'number' && v.postedAt > 0) out.pa = compressTimestamp(v.postedAt)
  return out
}

function expandNovelChapter(v: Record<string, unknown>): Record<string, unknown> {
  if (v.url !== undefined) return v
  const out: Record<string, unknown> = {
    url: v.u ?? '',
    title: v.t ?? '',
    postedAt: expandTimestamp(v.pa as number | undefined) ?? 0,
  }
  return out
}

function compressNovelBook(v: Record<string, unknown>): Record<string, unknown> {
  if (v.u !== undefined) return v
  const chapters = (v.latestChapters ?? []) as Record<string, unknown>[]
  const out: Record<string, unknown> = {
    u: v.url ?? v.u,
    si: v.siteId ?? v.si,
    t: v.title ?? v.t,
    lcs: chapters.map(compressNovelChapter),
    fa: compressTimestamp((v.fetchedAt ?? v.fa) as number | undefined),
  }
  if (v.lastSeenChapterUrl) out.lu = v.lastSeenChapterUrl
  if (v.error) out.e = v.error
  return out
}

function expandNovelBook(v: Record<string, unknown>): Record<string, unknown> {
  if (v.url !== undefined) return v
  const chapters = (v.lcs ?? []) as Record<string, unknown>[]
  const out: Record<string, unknown> = {
    url: v.u ?? '',
    siteId: v.si ?? '',
    title: v.t ?? '',
    latestChapters: chapters.map(expandNovelChapter),
    fetchedAt: expandTimestamp(v.fa as number | undefined) ?? 0,
    lastSeenChapterUrl: v.lu ?? '',
    error: v.e ?? '',
  }
  return out
}

// Per-source compress/expand dispatch via registry

type CodecShape = 'array' | 'grouped' | 'novels'

type CodecEntry = {
  shape: CodecShape
  compress: (v: Record<string, unknown>) => Record<string, unknown>
  expand: (v: Record<string, unknown>) => Record<string, unknown>
}

const CODECS: Record<string, CodecEntry> = {
  v2ex: { shape: 'array', compress: compressV2ex, expand: expandV2ex },
  reddit: { shape: 'grouped', compress: compressReddit, expand: expandReddit },
  hupu: { shape: 'grouped', compress: compressHupu, expand: expandHupu },
  'xueqiu-news': { shape: 'grouped', compress: compressXueqiu, expand: expandXueqiu },
  'xueqiu-hot': { shape: 'grouped', compress: compressXueqiu, expand: expandXueqiu },
  tnews: { shape: 'array', compress: compressTnews, expand: expandTnews },
  novels: { shape: 'novels', compress: compressNovelBook, expand: expandNovelBook },
}

function transformShape(
  data: unknown,
  shape: CodecShape,
  fn: (v: Record<string, unknown>) => Record<string, unknown>,
): unknown {
  if (data === null || data === undefined) return data
  switch (shape) {
    case 'array': {
      if (!Array.isArray(data)) return data
      return data.map((v) => fn(v as Record<string, unknown>))
    }
    case 'grouped': {
      const grouped = data as Record<string, unknown[]>
      if (typeof grouped !== 'object') return data
      const out: Record<string, unknown[]> = {}
      for (const key of Object.keys(grouped)) {
        out[key] = grouped[key].map((v) => fn(v as Record<string, unknown>))
      }
      return out
    }
    case 'novels': {
      const nd = data as { books?: unknown[] } | null
      if (nd && typeof nd === 'object' && Array.isArray(nd.books)) {
        return { books: nd.books.map((b) => fn(b as Record<string, unknown>)) }
      }
      return data
    }
  }
}

function compressData(sourceId: string, data: unknown): unknown {
  const entry = CODECS[sourceId]
  if (!entry) return data
  return transformShape(data, entry.shape, entry.compress)
}

function expandData(sourceId: string, data: unknown): unknown {
  const entry = CODECS[sourceId]
  if (!entry) return data
  return transformShape(data, entry.shape, entry.expand)
}

export function compressForStorage<T>(
  sourceId: string,
  cached: Omit<CachedSource<T>, 'schemaVersion'>,
): Record<string, unknown> {
  return {
    fetchedAt: cached.fetchedAt,
    data: compressData(sourceId, cached.data),
    error: cached.error,
  }
}

export function expandFromStorage<T>(sourceId: string, value: CachedSource<T>): CachedSource<T> {
  return {
    ...value,
    data: expandData(sourceId, value.data) as T,
    error: value.error ?? '',
  }
}
