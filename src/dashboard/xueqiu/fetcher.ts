import type { Runtime } from '../../runtime'
import type { XueqiuRenderData, XueqiuNewsItem, XueqiuSourceOptions } from './types'

type VueInstance = {
  $data?: Record<string, unknown>
  $options?: { name?: string }
  $children?: VueInstance[]
}

function isXueqiuPage(): boolean {
  const host = location.hostname
  return host === 'xueqiu.com' || host === 'www.xueqiu.com'
}

function isNewsItem(item: unknown): item is XueqiuNewsItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'id' in item &&
    'text' in item &&
    'target' in item &&
    'created_at' in item
  )
}

function extractStatuses(comp: VueInstance): XueqiuNewsItem[] {
  const data = comp.$data
  if (!Array.isArray(data?.statuses)) return []
  return data.statuses.filter((item): item is XueqiuNewsItem => isNewsItem(item))
}

function findComponentByName(comp: VueInstance, name: string): VueInstance | null {
  if (comp.$options?.name === name) return comp
  const children = comp.$children ?? []
  for (let i = 0; i < children.length; i++) {
    const found = findComponentByName(children[i], name)
    if (found) return found
  }
  return null
}

function clickTab(text: string): boolean {
  const links = document.querySelectorAll('a')
  for (let i = 0; i < links.length; i++) {
    const link = links[i]
    if (link.textContent?.trim() === text) {
      if (!link.classList.contains('active')) {
        link.click()
      }
      return true
    }
  }
  return false
}

function scrollToBottom(): void {
  const main = document.querySelector('.home__main')
  if (main) {
    main.scrollBy(0, main.clientHeight)
  } else {
    window.scrollBy(0, window.innerHeight)
  }
}

function clickLoadMore(): boolean {
  const btn = document.querySelector('.home-timeline > a')
  if (btn) {
    ;(btn as HTMLElement).click()
    return true
  }
  return false
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function autoScrollAndLoad(options: XueqiuSourceOptions): Promise<void> {
  const { scrollWaitMs, scrollMaxNoChange } = options
  let lastCount = 0
  let noChangeCount = 0

  for (let i = 0; i < 50; i++) {
    const appEl = document.querySelector('#app') as (Element & { __vue__?: VueInstance }) | null
    const timeline = appEl?.__vue__ ? findComponentByName(appEl.__vue__, 'HomeTimeline') : null
    const statuses = timeline ? extractStatuses(timeline) : []
    const currentCount = statuses.length

    if (currentCount === lastCount) {
      noChangeCount++
      if (noChangeCount >= scrollMaxNoChange) {
        break
      }
    } else {
      noChangeCount = 0
    }

    lastCount = currentCount

    scrollToBottom()
    await wait(scrollWaitMs)

    clickLoadMore()
    await wait(scrollWaitMs)
  }
}

export async function fetchXueqiu(
  _runtime: Runtime,
  options: XueqiuSourceOptions,
): Promise<XueqiuRenderData> {
  if (!isXueqiuPage()) {
    throw new Error('请访问 xueqiu.com 首页刷新数据')
  }
  if (location.pathname !== '/' && location.pathname !== '') {
    throw new Error('请在 xueqiu.com 首页（非帖子/用户页）刷新数据')
  }

  const app = document.querySelector('#app') as (Element & { __vue__?: VueInstance }) | null
  if (!app?.__vue__) {
    throw new Error('xueqiu: Vue 实例不可用，请刷新页面后重试')
  }

  // get news from 7x24 tab
  clickTab('7x24')
  await wait(500)
  await autoScrollAndLoad(options)
  const timeline = findComponentByName(app.__vue__, 'HomeTimeline')
  const news = timeline ? extractStatuses(timeline) : []

  // get hot posts from 热门 tab
  clickTab('热门')
  await wait(1000)
  await autoScrollAndLoad(options)
  const hotPosts = timeline ? extractStatuses(timeline) : []

  if (news.length === 0 && hotPosts.length === 0) {
    throw new Error('xueqiu: 未找到数据，请确认在 xueqiu.com 主页')
  }

  return { news, hotPosts }
}
