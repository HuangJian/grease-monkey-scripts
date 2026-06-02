import type { Runtime } from '../../runtime'
import { htmlToElement } from '../../utils'
import type { Source } from './types'

export type V2exTopic = {
  id: number
  title: string
  url: string
  replies: number
  member: { username: string }
  node: { title: string }
}

const HOT_URL = 'https://www.v2ex.com/api/topics/hot.json'

export type V2exSourceOptions = {
  ttlMinutes: number
  maxItems: number
}

export function createV2exSource(options: V2exSourceOptions): Source<V2exTopic[]> {
  return {
    id: 'v2ex',
    title: 'V2EX 热议',
    ttlMs: options.ttlMinutes * 60_000,
    fetch(runtime) {
      return fetchV2ex(runtime, options.maxItems)
    },
    render(container, data) {
      renderV2ex(container, data)
    },
  }
}

export function fetchV2ex(runtime: Runtime, maxItems: number): Promise<V2exTopic[]> {
  return new Promise<V2exTopic[]>((resolve, reject) => {
    runtime.request({
      url: HOT_URL,
      method: 'GET',
      timeout: 15000,
      anonymous: true,
      onload(response) {
        try {
          const json = JSON.parse(response.responseText) as unknown
          const topics = parseV2ex(json, maxItems)
          resolve(topics)
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      },
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    })
  })
}

export function parseV2ex(json: unknown, maxItems: number): V2exTopic[] {
  if (!Array.isArray(json)) return []
  const topics: V2exTopic[] = []
  for (const item of json) {
    if (!item || typeof item !== 'object') continue
    const t = item as Record<string, unknown>
    const id = typeof t.id === 'number' ? t.id : Number(t.id)
    const title = typeof t.title === 'string' ? t.title : ''
    const url = typeof t.url === 'string' ? t.url : ''
    const replies = typeof t.replies === 'number' ? t.replies : Number(t.replies ?? 0)
    const memberObj = t.member as Record<string, unknown> | undefined
    const nodeObj = t.node as Record<string, unknown> | undefined
    const member =
      memberObj && typeof memberObj.username === 'string'
        ? { username: memberObj.username }
        : { username: '' }
    const node =
      nodeObj && typeof nodeObj.title === 'string' ? { title: nodeObj.title } : { title: '' }
    if (!title || !url) continue
    topics.push({ id, title, url, replies, member, node })
    if (topics.length >= maxItems) break
  }
  return topics
}

function renderV2ex(container: HTMLElement, data: V2exTopic[] | null): void {
  const document = container.ownerDocument
  container.replaceChildren()
  if (!data || data.length === 0) {
    const empty = htmlToElement<HTMLDivElement>(document, '<div class="gm-sp-empty">暂无数据</div>')
    container.appendChild(empty)
    return
  }
  const list = htmlToElement<HTMLOListElement>(document, '<ol class="gm-sp-v2ex-list"></ol>')
  for (const topic of data) {
    const item = htmlToElement<HTMLLIElement>(
      document,
      `<li class="gm-sp-v2ex-item">
        <a class="gm-sp-v2ex-title" target="_blank" rel="noopener noreferrer"></a>
        <span class="gm-sp-v2ex-meta">
          <span class="gm-sp-v2ex-node"></span>
          <span class="gm-sp-v2ex-author"></span>
          <span class="gm-sp-v2ex-replies"></span>
        </span>
      </li>`,
    )
    const link = item.querySelector('.gm-sp-v2ex-title') as HTMLAnchorElement
    link.href = topic.url
    link.textContent = topic.title
    item.querySelector('.gm-sp-v2ex-node')!.textContent = topic.node.title
    item.querySelector('.gm-sp-v2ex-author')!.textContent = topic.member.username
      ? `@${topic.member.username}`
      : ''
    item.querySelector('.gm-sp-v2ex-replies')!.textContent = `💬 ${topic.replies}`
    list.appendChild(item)
  }
  container.appendChild(list)
}
