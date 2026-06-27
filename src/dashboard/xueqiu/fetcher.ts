/**
 * Xueqiu data fetcher.
 *
 * Fetches hot posts and news from xueqiu.com by intercepting XHR responses
 * via injected script. Requires page to be on xueqiu.com domain.
 *
 * Test script: scripts/fetchers/xueqiu-test.user.js
 *   Install as Tampermonkey userscript and run on xueqiu.com to verify fetching.
 */
import { loadCache } from '../cache'
import type { Runtime } from '../../runtime'
import type { XueqiuRenderData, XueqiuNewsItem, XueqiuSourceOptions } from './types'

declare var unsafeWindow: Window

// ---- API item shape (from intercepted XHR) ----

type ApiItem = Record<string, unknown> & { id: number }

type CapturedSource = {
  items: ApiItem[]
  count: number
}

type CapturedData = {
  hot: CapturedSource
  news: CapturedSource
}

// ---- API item to XueqiuNewsItem mapping ----

function toNewsItem(item: ApiItem): XueqiuNewsItem {
  return {
    id: item.id,
    title: String(item.title ?? ''),
    text: String(item.text ?? item.description ?? ''),
    description: String(item.description ?? ''),
    target: String(item.target ?? `/status/${item.id}`),
    created_at: Number(item.created_at ?? 0),
    status_id: Number(item.status_id ?? item.id),
    reply_count: Number(item.reply_count ?? 0),
    like_count: Number(item.like_count ?? item.fav_count ?? 0),
    share_count: Number(item.share_count ?? item.retweet_count ?? 0),
    view_count: Number(item.view_count ?? 0),
    sub_type: Number(item.sub_type ?? item.type ?? 0),
  }
}

// ---- XHR interceptor injection ----

function injectInterceptor(runtime: Runtime): void {
  if ((unsafeWindow as Window & { __xqInjected?: boolean }).__xqInjected) return
  runtime.addElement(runtime.document.documentElement, 'script', {
    textContent: `
    (function() {
      var hotItems = [], hotCount = 0
      var newsItems = [], newsCount = 0
      var origOpen = XMLHttpRequest.prototype.open
      XMLHttpRequest.prototype.open = function(method, url) {
        var u = typeof url === 'string' ? url : (url ? url.toString() : '')
        var self = this
        if (u.indexOf('/statuses/hot/listV3.json') !== -1) {
          self.addEventListener('load', function() {
            hotCount++
            try {
              var d = JSON.parse(self.responseText), items = d.list || []
              for (var i = 0; i < items.length; i++) hotItems.push(items[i])
            } catch(e) {}
          })
        }
        if (u.indexOf('/statuses/livenews/list.json') !== -1) {
          self.addEventListener('load', function() {
            newsCount++
            try {
              var d = JSON.parse(self.responseText), items = d.list || d.items || []
              for (var i = 0; i < items.length; i++) newsItems.push(items[i])
            } catch(e) {}
          })
        }
        return origOpen.apply(this, arguments)
      }
      window.__xqCaptured = function() {
        return { hot: { items: hotItems, count: hotCount }, news: { items: newsItems, count: newsCount } }
      }
      window.__xqResetCaptured = function(mode) {
        if (mode === 'hot' || !mode) { hotItems = []; hotCount = 0 }
        if (mode === 'news' || !mode) { newsItems = []; newsCount = 0 }
      }
    })();
  `,
  })
  ;(unsafeWindow as Window & { __xqInjected?: boolean }).__xqInjected = true
}

function readCaptured(): CapturedData | null {
  const w = unsafeWindow as Window & { __xqCaptured?: () => CapturedData }
  return w.__xqCaptured?.() ?? null
}

function resetCaptured(mode: 'news' | 'hot'): void {
  const w = unsafeWindow as Window & { __xqResetCaptured?: (mode: string) => void }
  w.__xqResetCaptured?.(mode)
}

// ---- DOM interaction helpers ----

function humanLikeClick(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
  el.click()
}

function clickTab(doc: Document, text: string): boolean {
  const links = doc.querySelectorAll('a')
  let found = false
  links.forEach((link) => {
    if (link.textContent?.trim() === text && !link.classList.contains('active')) {
      humanLikeClick(link)
      found = true
    }
  })
  return found
}

function doScroll(doc: Document, win: Window): void {
  const main = doc.querySelector('.home__main')
  if (main) {
    const fraction = 0.4 + Math.random() * 0.5
    main.scrollBy(0, Math.round(main.clientHeight * fraction))
  } else {
    win.scrollBy(0, Math.round(win.innerHeight * (0.4 + Math.random() * 0.5)))
  }
}

function backScroll(doc: Document): void {
  if (Math.random() < 0.15) {
    const main = doc.querySelector('.home__main')
    if (main) {
      main.scrollBy(0, -Math.round(main.clientHeight * (0.05 + Math.random() * 0.15)))
    }
  }
}

function clickLoadMore(doc: Document): void {
  const btn =
    doc.querySelector<HTMLElement>('.home-timeline > a') ??
    doc.querySelector<HTMLElement>('.status-list > a')
  if (!btn || btn.textContent?.trim() !== '加载更多') {
    throw new Error('xueqiu: 未找到「加载更多」按钮')
  }
  btn.click()
}

function waitJitter(baseMs: number, variance = 0.4): Promise<void> {
  const ms = baseMs * (1 - variance + Math.random() * variance * 2)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function dedupById(items: XueqiuNewsItem[]): XueqiuNewsItem[] {
  const seen = new Set<number>()
  const result: XueqiuNewsItem[] = []
  items.forEach((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      result.push(item)
    }
  })
  return result
}

// ---- Early exit logic (exported for testing) ----

export function shouldEarlyExit(
  _mode: 'news' | 'hot',
  asNewsItems: XueqiuNewsItem[],
  knownIds: Set<number>,
): boolean {
  return asNewsItems.every((item) => knownIds.has(item.id))
}

// ---- Fetch logic for one source ----

async function fetchSource(
  doc: Document,
  win: Window,
  mode: 'news' | 'hot',
  knownIds: Set<number>,
): Promise<XueqiuNewsItem[]> {
  const tabText = mode === 'news' ? '7x24' : '热门'
  const maxRounds = 30

  resetCaptured(mode)

  clickTab(doc, '资讯')
  await waitJitter(1500, 0.3)
  clickTab(doc, tabText)
  await waitJitter(5000, 0.4)

  const all: XueqiuNewsItem[] = []

  for (let round = 1; round <= maxRounds; round++) {
    doScroll(doc, win)
    backScroll(doc)
    await waitJitter(4000, 0.4)

    clickLoadMore(doc)
    await waitJitter(4000, 0.4)

    const captured = readCaptured()
    const source = mode === 'news' ? captured?.news : captured?.hot
    const batch = source?.items ?? []
    const reqCount = source?.count ?? 0

    // First round: verify the API actually fired
    if (round === 1 && reqCount === 0) {
      throw new Error(`xueqiu: ${tabText} 数据获取失败，API 无响应，请确认页面已加载完成`)
    }

    // Convert raw API items and filter out already-known IDs
    const asNewsItems = batch.map(toNewsItem)
    const newItems: XueqiuNewsItem[] = []
    const seen = new Set<number>()
    asNewsItems.forEach((item) => {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        if (!knownIds.has(item.id)) {
          newItems.push(item)
        }
      }
    })

    if (newItems.length === 0) break

    all.push(...newItems)

    // Add new IDs to known set so subsequent rounds also skip them
    newItems.forEach((item) => knownIds.add(item.id))

    if (shouldEarlyExit(mode, asNewsItems, knownIds)) break
  }

  return dedupById(all)
}

// ---- Public API ----

export async function fetchXueqiu(
  runtime: Runtime,
  _options: XueqiuSourceOptions,
): Promise<XueqiuRenderData> {
  const doc = runtime.document
  const win = doc.defaultView!
  injectInterceptor(runtime)

  const cached = await loadCache<XueqiuRenderData>(runtime, 'xueqiu-news')
  const newsKnownIds = new Set<number>()
  const hotKnownIds = new Set<number>()
  if (cached?.data) {
    cached.data.news.forEach((item) => newsKnownIds.add(item.id))
    cached.data.hotPosts.forEach((item) => hotKnownIds.add(item.id))
  }

  const news = await fetchSource(doc, win, 'news', newsKnownIds)
  const hotPosts = await fetchSource(doc, win, 'hot', hotKnownIds)

  return { news, hotPosts }
}
