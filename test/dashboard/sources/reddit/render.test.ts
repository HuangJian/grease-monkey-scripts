import { beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import {
  CACHE_KEY,
  CACHE_SCHEMA_VERSION,
  STATE_KEY,
  type CachedSource,
} from '../../../../src/dashboard/types'
import { createExpandCollapse } from '../../../../src/dashboard/reddit/expand-collapse'
import { renderReddit } from '../../../../src/dashboard/reddit/render'
import { createRedditState, type RedditState } from '../../../../src/dashboard/reddit/state'
import type { RedditPost } from '../../../../src/dashboard/reddit/types'
import type { AuthorTagMap } from '../../../../src/shared/author-labels'
import { createRuntime, type TestRuntime } from '../../../runtime'

const NOW = Date.now() - 60_000

function makePost(over: Partial<RedditPost>): RedditPost {
  return {
    id: 'x',
    title: 'hello',
    url: 'https://www.reddit.com/r/x/comments/x/t',
    score: 100,
    numComments: 10,
    subreddits: ['x'],
    author: 'u',
    created: NOW,
    ...over,
  }
}

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><body></body></html>')
}

describe('renderReddit', () => {
  let dom: JSDOM
  let container: HTMLElement
  let state: RedditState

  beforeEach(() => {
    dom = makeDom()
    globalThis.document = dom.window.document
    container = dom.window.document.createElement('div')
    state = createRedditState()
  })

  test('renders one section per sub with title, list, and items', () => {
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1', title: 'cat' })],
      funny: [makePost({ id: 'f1', title: 'joke', subreddits: ['funny'] })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    const sections = container.querySelectorAll('.gm-sp-reddit-section')
    expect(sections).toHaveLength(2)
    expect((sections[0]! as HTMLElement).dataset['sub']).toBe('aww')
    expect(sections[0]!.querySelector('.gm-sp-reddit-sub-title')!.textContent).toContain('r/aww')
    expect(sections[0]!.querySelector('.gm-sp-item-title')!.textContent).toBe('cat')
    expect((sections[1]! as HTMLElement).dataset['sub']).toBe('funny')
  })

  test('renders section order matching data insertion order', () => {
    const data: Record<string, RedditPost[]> = {
      zeta: [makePost({ id: 'z1', title: 'z', subreddits: ['zeta'] })],
      alpha: [makePost({ id: 'a1', title: 'a', subreddits: ['alpha'] })],
      mu: [makePost({ id: 'm1', title: 'm', subreddits: ['mu'] })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    const subs = Array.from(container.querySelectorAll<HTMLElement>('.gm-sp-reddit-section')).map(
      (s) => s.dataset['sub'],
    )
    expect(subs).toEqual(['zeta', 'alpha', 'mu'])
  })

  test('skips empty subs in rendering', () => {
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1' })],
      funny: [],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    expect(container.querySelectorAll('.gm-sp-reddit-section')).toHaveLength(1)
  })

  test('renders empty state when data is null or empty', () => {
    renderReddit(container, null, state, null, createExpandCollapse())
    expect(container.querySelector('.gm-sp-empty')!.textContent).toBe('暂无数据')

    container.replaceChildren()
    renderReddit(container, {}, state, null, createExpandCollapse())
    expect(container.querySelector('.gm-sp-empty')!.textContent).toBe('暂无数据')
  })

  test('renders source badge, comment count, title, and score in items', () => {
    const data: Record<string, RedditPost[]> = {
      aww: [
        makePost({
          id: 'a1',
          score: 1234,
          numComments: 56,
          title: 'hi',
          subreddits: ['aww', 'funny'],
        }),
      ],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    const item = container.querySelector('.gm-sp-list-item')!
    const badge = item.querySelector('.gm-sp-reddit-source')!
    expect(badge.textContent).toBe('🌅')
    expect(badge.getAttribute('title')).toBe('今日主题')
    expect(item.querySelector('.gm-sp-item-count')!.textContent).toBe('56')
    expect(item.querySelector('.gm-sp-reddit-score')!.textContent).toBe('1234')
    expect(item.querySelector('.gm-sp-reddit-author')!.textContent).toBe('@u')
  })

  test('adds pos class and tags for highly-rated author', () => {
    const tags: AuthorTagMap = { u: { 智者: { url: 'c/1', score: 3 } } }
    const data: Record<string, RedditPost[]> = { aww: [makePost({ id: 'a1' })] }
    renderReddit(container, data, state, null, createExpandCollapse(), tags)
    const author = container.querySelector('.gm-sp-reddit-author')!
    expect(author.classList.contains('gm-sp-author-pos')).toBe(true)
    const title = container.querySelector('.gm-sp-item-title')!
    const tagSpan = title.querySelector('.gm-sp-author-tag')!
    expect(tagSpan.textContent).toBe('#智者')
    expect(tagSpan.classList.contains('gm-sp-author-pos')).toBe(true)
  })

  test('adds neg class and tags for lowly-rated author', () => {
    const tags: AuthorTagMap = { u: { 若婴: { url: 'c/1', score: -2 } } }
    const data: Record<string, RedditPost[]> = { aww: [makePost({ id: 'a1' })] }
    renderReddit(container, data, state, null, createExpandCollapse(), tags)
    const author = container.querySelector('.gm-sp-reddit-author')!
    expect(author.classList.contains('gm-sp-author-neg')).toBe(true)
    const title = container.querySelector('.gm-sp-item-title')!
    const tagSpan = title.querySelector('.gm-sp-author-tag')!
    expect(tagSpan.textContent).toBe('#若婴')
    expect(tagSpan.classList.contains('gm-sp-author-neg')).toBe(true)
  })

  test('shows tag without pos/neg for neutral-score author', () => {
    const tags: AuthorTagMap = { u: { 智者: { url: 'c/1', score: 0 } } }
    const data: Record<string, RedditPost[]> = { aww: [makePost({ id: 'a1' })] }
    renderReddit(container, data, state, null, createExpandCollapse(), tags)
    const author = container.querySelector('.gm-sp-reddit-author')!
    expect(author.classList.contains('gm-sp-author-pos')).toBe(false)
    expect(author.classList.contains('gm-sp-author-neg')).toBe(false)
    const title = container.querySelector('.gm-sp-item-title')!
    const tagSpan = title.querySelector('.gm-sp-author-tag')!
    expect(tagSpan.textContent).toBe('#智者')
    expect(tagSpan.classList.contains('gm-sp-author-pos')).toBe(false)
    expect(tagSpan.classList.contains('gm-sp-author-neg')).toBe(false)
  })

  test('no tags or author class for unscored author', () => {
    const data: Record<string, RedditPost[]> = { aww: [makePost({ id: 'a1' })] }
    renderReddit(container, data, state, null, createExpandCollapse())
    const author = container.querySelector('.gm-sp-reddit-author')!
    expect(author.textContent).toBe('@u')
    expect(author.classList.contains('gm-sp-author-pos')).toBe(false)
    expect(author.classList.contains('gm-sp-author-neg')).toBe(false)
    const title = container.querySelector('.gm-sp-item-title')!
    expect(title.querySelector('.gm-sp-author-tag')).toBeNull()
  })

  test('keeps full title (CSS handles overflow truncation)', () => {
    const longTitle = 'a'.repeat(150)
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1', title: longTitle })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    expect(container.querySelector('.gm-sp-item-title')!.textContent).toBe(longTitle)
  })

  test('keeps short titles unchanged', () => {
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1', title: 'short' })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    expect(container.querySelector('.gm-sp-item-title')!.textContent).toBe('short')
  })

  test('clicking title marks the post as read', () => {
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1' })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    const link = container.querySelector('.gm-sp-item-title') as HTMLAnchorElement
    link.click()
    expect(state.isRead('a1')).toBe(true)
    expect(container.querySelector('.gm-sp-list-item')!.classList.contains('gm-sp-item-read')).toBe(
      true,
    )
  })

  test('applies read class for previously-read posts', () => {
    state.markRead('a1')
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1' })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    expect(container.querySelector('.gm-sp-list-item')!.classList.contains('gm-sp-item-read')).toBe(
      true,
    )
  })

  test('filters out hidden posts from rendering', () => {
    state.markHidden('a1')
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1' }), makePost({ id: 'a2' })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    expect(container.querySelectorAll('.gm-sp-list-item')).toHaveLength(1)
  })
})

describe('renderReddit hide button', () => {
  let dom: JSDOM
  let container: HTMLElement
  let state: RedditState
  let runtime: TestRuntime

  beforeEach(() => {
    dom = makeDom()
    container = dom.window.document.createElement('div')
    state = createRedditState()
    runtime = createRuntime(dom)
  })

  test('removes item from DOM, marks hidden, saves state, removes from cache and history', async () => {
    runtime.stores[CACHE_KEY('reddit')] = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      data: {
        aww: [
          makePost({ id: 'a1', subreddits: ['aww'] }),
          makePost({ id: 'a2', subreddits: ['aww'] }),
        ],
      },
      fetchedAt: Date.now(),
      byteSize: 0,
    } as CachedSource<unknown>
    runtime.stores['gm:reddit:topics-history'] = [
      {
        id: 'a1',
        title: 'hi',
        url: 'https://www.reddit.com/r/aww/comments/a1/t',
        score: 100,
        numComments: 1,
        subreddits: ['aww'],
        author: 'u',
        created: NOW,
      },
    ]
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1' }), makePost({ id: 'a2' })],
    }
    renderReddit(container, data, state, runtime, createExpandCollapse())
    expect(container.querySelectorAll('.gm-sp-list-item')).toHaveLength(2)
    const hideBtn = container.querySelector('.gm-sp-item-hide') as HTMLButtonElement
    hideBtn.click()
    expect(container.querySelectorAll('.gm-sp-list-item')).toHaveLength(1)
    expect(state.isHidden('a1')).toBe(true)
    await new Promise<void>((r) => setTimeout(r, 0))
    const stored = runtime.stores[STATE_KEY('reddit')] as Record<string, { h?: number }>
    expect(stored['a1']?.h).toBeGreaterThan(0)
    const cache = runtime.stores[CACHE_KEY('reddit')] as CachedSource<Record<string, RedditPost[]>>
    const aww = cache.data!['aww']!
    expect(aww.map((p) => p.id)).toEqual(['a2'])
    const history = runtime.stores['gm:reddit:topics-history'] as Array<{ id: string }>
    expect(history.map((h) => h.id)).toEqual([])
  })

  test('does not write to storage when runtime is null', () => {
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1' })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    const hideBtn = container.querySelector('.gm-sp-item-hide') as HTMLButtonElement
    hideBtn.click()
    expect(state.isHidden('a1')).toBe(true)
  })
})

describe('renderReddit sub collapse', () => {
  let dom: JSDOM
  let container: HTMLElement
  let state: RedditState

  beforeEach(() => {
    dom = makeDom()
    globalThis.document = dom.window.document
    container = dom.window.document.createElement('div')
    state = createRedditState()
  })

  function makeDataWithSubs(subCount: number, perSub: number): Record<string, RedditPost[]> {
    const data: Record<string, RedditPost[]> = {}
    for (let i = 0; i < subCount; i++) {
      const sub = `sub${i}`
      const posts: RedditPost[] = []
      for (let j = 0; j < perSub; j++) {
        posts.push(makePost({ id: `${sub}${j}`, title: `${sub}-${j}`, subreddits: [sub] }))
      }
      data[sub] = posts
    }
    return data
  }

  test('shows all sections expanded when total <= 20', () => {
    const data = makeDataWithSubs(3, 3)
    renderReddit(container, data, state, null, createExpandCollapse())
    const sections = container.querySelectorAll<HTMLElement>('.gm-sp-reddit-section')
    expect(sections).toHaveLength(3)
    for (const s of sections) {
      expect(s.classList.contains('gm-sp-reddit-section-collapsed')).toBe(false)
    }
    expect(container.querySelectorAll('.gm-sp-reddit-caret-visible')).toHaveLength(0)
  })

  test('expands only first 2 subs by default when total > 20', () => {
    const data = makeDataWithSubs(5, 5)
    renderReddit(container, data, state, null, createExpandCollapse())
    const sections = Array.from(container.querySelectorAll<HTMLElement>('.gm-sp-reddit-section'))
    const collapsedSubs = sections
      .filter((s) => s.classList.contains('gm-sp-reddit-section-collapsed'))
      .map((s) => s.dataset['sub'])
    expect(collapsedSubs).toEqual(['sub2', 'sub3', 'sub4'])
    expect(container.querySelectorAll('.gm-sp-reddit-caret-visible')).toHaveLength(5)
  })

  test('clicking a collapsed sub expands it', () => {
    const data = makeDataWithSubs(5, 5)
    const ec = createExpandCollapse()
    renderReddit(container, data, state, null, ec)
    const sub2 = container.querySelector<HTMLElement>('[data-sub="sub2"]')!
    const sub2Title = sub2.querySelector('.gm-sp-reddit-sub-title') as HTMLElement
    sub2Title.click()
    expect(sub2.classList.contains('gm-sp-reddit-section-collapsed')).toBe(false)
  })

  test('clicking an expanded sub collapses it', () => {
    const data = makeDataWithSubs(5, 5)
    const ec = createExpandCollapse()
    renderReddit(container, data, state, null, ec)
    const sub0 = container.querySelector<HTMLElement>('[data-sub="sub0"]')!
    const sub0Title = sub0.querySelector('.gm-sp-reddit-sub-title') as HTMLElement
    sub0Title.click()
    expect(sub0.classList.contains('gm-sp-reddit-section-collapsed')).toBe(true)
  })

  test('clicking title is a no-op when total <= 20', () => {
    const data = makeDataWithSubs(3, 3)
    const ec = createExpandCollapse()
    renderReddit(container, data, state, null, ec)
    const sub0 = container.querySelector<HTMLElement>('[data-sub="sub0"]')!
    const sub0Title = sub0.querySelector('.gm-sp-reddit-sub-title') as HTMLElement
    sub0Title.click()
    expect(sub0.classList.contains('gm-sp-reddit-section-collapsed')).toBe(false)
  })
})

describe('renderReddit reply count formatting', () => {
  let dom: JSDOM
  let container: HTMLElement
  let state: RedditState

  beforeEach(() => {
    dom = makeDom()
    globalThis.document = dom.window.document
    container = dom.window.document.createElement('div')
    state = createRedditState()
  })

  test('shows plain count for unread post', () => {
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1', numComments: 10 })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    const count = container.querySelector('.gm-sp-item-count')!
    expect(count.textContent).toBe('10')
  })

  test('shows plain count when read and no new comments', () => {
    state.markRead('a1', Date.now(), 10)
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1', numComments: 10 })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    const count = container.querySelector('.gm-sp-item-count')!
    expect(count.textContent).toBe('10')
  })

  test('shows new comment count when read and comments increased', () => {
    state.markRead('a1', Date.now(), 10)
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1', numComments: 15 })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    const count = container.querySelector('.gm-sp-item-count')!
    expect(count.textContent).toBe('10+5')
  })

  test('clicking title stores comment count', () => {
    const data: Record<string, RedditPost[]> = {
      aww: [makePost({ id: 'a1', numComments: 10 })],
    }
    renderReddit(container, data, state, null, createExpandCollapse())
    const link = container.querySelector('.gm-sp-item-title') as HTMLAnchorElement
    link.click()
    expect(state.getReadReplies('a1')).toBe(10)
  })
})
