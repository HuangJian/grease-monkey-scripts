import { htmlToDocument, toAbsoluteUrl } from '../../../utils'
import { parseChapterLabel } from '../../shared/date-parse'
import type { NovelRawChapter } from '../types'
import type { NovelAdapter, ParsedHome } from './types'

const SUDUGU_HOSTNAMES = ['www.sudugu.org', 'sudugu.org', 'www.shudugu.org', 'shudugu.org'] as const
const DEQIXS_HOSTNAMES = ['www.deqixs.org', 'deqixs.org'] as const

function extractTitleFromH1(h1: Element): string | null {
  // Real site markup is `<h1><a href>真实书名</a>最新章节</h1>`. Prefer the
  // anchor text so the trailing "最新章节" marker is not captured as part of
  // the title.
  const anchor = h1.querySelector('a')
  const fromAnchor = (anchor?.textContent ?? '').trim()
  if (fromAnchor) return fromAnchor
  // Fallback for fixtures that place the title directly in the h1: drop <i>
  // metadata (e.g. "<i>100万字</i>书名") and use the remaining text.
  const clone = h1.cloneNode(true) as Element
  clone.querySelectorAll('i').forEach((child) => child.remove())
  const text = (clone.textContent ?? '').trim()
  return text || null
}

function parseLatestThree(
  itemTxt: Element | null | undefined,
  pageUrl: string,
  now: number,
): NovelRawChapter[] {
  const latestThree: NovelRawChapter[] = []
  const liNodes = itemTxt?.querySelectorAll(':scope > ul > li') ?? []
  liNodes.forEach((li) => {
    const anchor = li.querySelector('a[href]')
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    const url = toAbsoluteUrl(href, pageUrl)
    const chapterTitle = (anchor.textContent ?? '').trim()
    if (!url || !chapterTitle) return
    const labelEl = li.querySelector('i')
    const labelText = (labelEl?.textContent ?? '').trim()
    const postedAt = labelText ? (parseChapterLabel(labelText, now) ?? 0) : 0
    latestThree.push({ url, title: chapterTitle, postedAt })
  })
  return latestThree
}

function overlayTimestamps(chapters: NovelRawChapter[], latestThree: NovelRawChapter[]): void {
  const labelByUrl = new Map<string, number>()
  for (const c of latestThree) {
    if (c.postedAt > 0) labelByUrl.set(c.url, c.postedAt)
  }
  for (let i = 0; i < chapters.length; i++) {
    const pa = labelByUrl.get(chapters[i]!.url)
    if (pa !== undefined) chapters[i] = { ...chapters[i]!, postedAt: pa }
  }
}

function parseHome(
  html: string,
  pageUrl: string,
  domParser: DOMParser,
  now: number = Date.now(),
): ParsedHome {
  if (!html) {
    return { title: null, latestThree: [], homeChapters: [], lastPageNumber: 1 }
  }
  const doc = htmlToDocument(html, domParser)
  const itemTxt = doc.querySelector('.itemtxt')
  const h1 = itemTxt?.querySelector('h1') ?? null
  const title = h1 ? extractTitleFromH1(h1) : null

  const latestThree = parseLatestThree(itemTxt, pageUrl, now)
  const lastPageNumber = parseLastPageNumber(doc)

  // Check if the full chapter list (#list) is available on the home page
  const list = doc.querySelector('#list')
  const listAnchors = list?.querySelectorAll('ul li a[href]')

  if (listAnchors && listAnchors.length > 0) {
    const chapters: NovelRawChapter[] = []
    listAnchors.forEach((anchor) => {
      const href = anchor.getAttribute('href') ?? ''
      const url = toAbsoluteUrl(href, pageUrl)
      const chapterTitle = (anchor.textContent ?? '').trim()
      if (!url || !chapterTitle) return
      chapters.push({ url, title: chapterTitle, postedAt: 0 })
    })
    // Reverse to newest-first order (sudugu's #list is oldest-first)
    const homeChapters = chapters.reverse()
    overlayTimestamps(homeChapters, latestThree)
    return { title, latestThree, homeChapters, lastPageNumber }
  }

  return { title, latestThree, homeChapters: [], lastPageNumber }
}

function parseLastPageNumber(doc: Document): number {
  const select = doc.querySelector('#pages #pageSelect')
  if (!select) return 1
  let max = 1
  select.querySelectorAll('option').forEach((option) => {
    const value = option.getAttribute('value') ?? ''
    const n = Number(value)
    if (Number.isFinite(n) && n > max) max = n
  })
  return max
}

function parseChapterList(html: string, pageUrl: string, domParser: DOMParser): NovelRawChapter[] {
  if (!html) return []
  const doc = htmlToDocument(html, domParser)
  const list = doc.querySelector('#list')
  if (!list) return []
  const chapters: NovelRawChapter[] = []
  const anchors = list.querySelectorAll('ul li a[href]')
  anchors.forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? ''
    const url = toAbsoluteUrl(href, pageUrl)
    const title = (anchor.textContent ?? '').trim()
    if (!url || !title) return
    chapters.push({ url, title, postedAt: 0 })
  })
  return chapters
}

function buildTailUrl(homeUrl: string, pageNumber: number): string {
  if (pageNumber <= 1) return homeUrl
  // Ensure base ends with '/' so p-N.html resolves within the book directory
  const base = homeUrl.endsWith('/') ? homeUrl : `${homeUrl}/`
  return toAbsoluteUrl(`p-${pageNumber}.html`, base)
}

/**
 * sudugu and deqixs serve the same chapter-list template, so they share one
 * parser. Each adapter keeps its own id/hostnames so the per-source `siteId`
 * and UI label stay correct per site, and mirror fallback stays scoped to each
 * site's own hosts (no cross-site leakage).
 */
function makeTemplateAdapter(id: string, hostnames: readonly string[]): NovelAdapter {
  return { id, hostnames: hostnames as string[], parseHome, parseChapterList, buildTailUrl }
}

export const suduguAdapter = makeTemplateAdapter('sudugu', SUDUGU_HOSTNAMES)
export const deqixsAdapter = makeTemplateAdapter('deqixs', DEQIXS_HOSTNAMES)
