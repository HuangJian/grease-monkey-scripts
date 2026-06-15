import { htmlToDocument, toAbsoluteUrl } from '../../../utils'
import type { NovelChapter } from '../types'
import type { NovelAdapter, ParsedHome } from './types'

const SUDUGU_HOSTNAMES = ['www.sudugu.org', 'sudugu.org'] as const

export function parseChapterLabel(text: string, now: number = Date.now()): number | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const nowDate = new Date(now)

  if (trimmed === '今天') {
    return startOfDay(nowDate).getTime()
  }
  if (trimmed === '昨天') {
    const d = startOfDay(nowDate)
    d.setDate(d.getDate() - 1)
    return d.getTime()
  }

  const fullDate = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  if (fullDate) {
    const [, y, m, d] = fullDate
    return new Date(Number(y), Number(m) - 1, Number(d)).getTime()
  }

  const monthDay = /^(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  if (monthDay) {
    const [, m, d] = monthDay
    const year = nowDate.getFullYear()
    const candidate = new Date(year, Number(m) - 1, Number(d))
    if (candidate.getTime() > now) {
      candidate.setFullYear(year - 1)
    }
    return candidate.getTime()
  }

  const hourMinute = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (hourMinute) {
    const [, h, m] = hourMinute
    const d = startOfDay(nowDate)
    d.setHours(Number(h), Number(m), 0, 0)
    return d.getTime()
  }

  return undefined
}

function startOfDay(d: Date): Date {
  const copy = new Date(d.getTime())
  copy.setHours(0, 0, 0, 0)
  return copy
}

function extractTitleFromH1(h1: Element): string | null {
  const clone = h1.cloneNode(true) as Element
  clone.querySelectorAll('i').forEach((child) => child.remove())
  const text = (clone.textContent ?? '').trim()
  return text || null
}

function parseHome(
  html: string,
  pageUrl: string,
  domParser: DOMParser,
  now: number = Date.now(),
): ParsedHome {
  if (!html) {
    return { title: null, latestThree: [], lastPageNumber: 1 }
  }
  const doc = htmlToDocument(html, domParser)
  const itemTxt = doc.querySelector('.itemtxt')
  const h1 = itemTxt?.querySelector('h1') ?? null
  const title = h1 ? extractTitleFromH1(h1) : null

  const latestThree: NovelChapter[] = []
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
    const postedAt = labelText ? parseChapterLabel(labelText, now) : undefined
    const chapter: NovelChapter = { url, title: chapterTitle }
    if (postedAt !== undefined) chapter.postedAt = postedAt
    latestThree.push(chapter)
  })

  const lastPageNumber = parseLastPageNumber(doc)
  return { title, latestThree, lastPageNumber }
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

function parseChapterList(html: string, pageUrl: string, domParser: DOMParser): NovelChapter[] {
  if (!html) return []
  const doc = htmlToDocument(html, domParser)
  const list = doc.querySelector('#list')
  if (!list) return []
  const chapters: NovelChapter[] = []
  const anchors = list.querySelectorAll('ul li a[href]')
  anchors.forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? ''
    const url = toAbsoluteUrl(href, pageUrl)
    const title = (anchor.textContent ?? '').trim()
    if (!url || !title) return
    chapters.push({ url, title })
  })
  return chapters
}

function buildTailUrl(homeUrl: string, pageNumber: number): string {
  if (pageNumber <= 1) return homeUrl
  return toAbsoluteUrl(`p-${pageNumber}.html`, homeUrl)
}

export const suduguAdapter: NovelAdapter = {
  id: 'sudugu',
  hostnames: SUDUGU_HOSTNAMES,
  parseHome,
  parseChapterList,
  buildTailUrl,
}
