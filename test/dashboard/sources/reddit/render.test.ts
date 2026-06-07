import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { createRedditSource } from '../../../../src/dashboard/reddit/source'
import type { RedditPost, RedditSourceOptions } from '../../../../src/dashboard/reddit/types'

const DEFAULT_COUNT_OPTS = {
  minItems: 10,
  maxItems: 30,
  minPerSub: 1,
  displayRatio: 0.1,
  elbowDropRatio: 0.4,
  minCutoffScore: 500,
}

function defaultRedditOpts(over: Partial<RedditSourceOptions> = {}): RedditSourceOptions {
  return {
    ttlMinutes: 30,
    subreddits: ['popular'],
    ...DEFAULT_COUNT_OPTS,
    ...over,
  }
}

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.v2ex.com/',
  })
}

describe('createRedditSource.render', () => {
  test('renders posts with score, sub list, and comments', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createRedditSource(defaultRedditOpts())
    const posts: RedditPost[] = [
      {
        id: 'a',
        title: 'Hello',
        url: 'https://www.reddit.com/r/popular/comments/a/hello',
        score: 1234,
        numComments: 56,
        subreddits: ['popular', 'funny'],
        author: 'u',
      },
    ]
    source.render(container, posts)
    const item = container.querySelector('.gm-sp-reddit-item')!
    expect(item.querySelector('.gm-sp-reddit-count')!.textContent).toBe('1234')
    expect(item.querySelector('.gm-sp-reddit-title')!.textContent).toBe('Hello')
    expect(item.querySelector('.gm-sp-reddit-sub')!.textContent).toBe('r/popular, r/funny')
    expect(item.querySelector('.gm-sp-reddit-comments')!.textContent).toBe('💬 56')
  })
  test('renders empty state when no posts', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createRedditSource(defaultRedditOpts())
    source.render(container, [])
    expect(container.querySelector('.gm-sp-empty')!.textContent).toBe('暂无数据')
  })
  test('renders empty state when data is null', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createRedditSource(defaultRedditOpts())
    source.render(container, null)
    expect(container.querySelector('.gm-sp-empty')!.textContent).toBe('暂无数据')
  })
  test('clicking title adds read class', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createRedditSource(defaultRedditOpts())
    source.render(container, [
      {
        id: 'r1',
        title: 't',
        url: 'https://www.reddit.com/r/x/comments/r1/t',
        score: 1,
        numComments: 0,
        subreddits: ['x'],
        author: 'u',
      },
    ])
    const link = container.querySelector('.gm-sp-reddit-title') as HTMLAnchorElement
    link.click()
    expect(
      container.querySelector('.gm-sp-reddit-item')!.classList.contains('gm-sp-reddit-read'),
    ).toBe(true)
  })
  test('hide button removes item from list', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createRedditSource(defaultRedditOpts())
    source.render(container, [
      {
        id: 'r1',
        title: 't',
        url: 'https://www.reddit.com/r/x/comments/r1/t',
        score: 1,
        numComments: 0,
        subreddits: ['x'],
        author: 'u',
      },
      {
        id: 'r2',
        title: 't2',
        url: 'https://www.reddit.com/r/x/comments/r2/t2',
        score: 1,
        numComments: 0,
        subreddits: ['x'],
        author: 'u',
      },
    ])
    expect(container.querySelectorAll('.gm-sp-reddit-item')).toHaveLength(2)
    const hideBtn = container.querySelector('.gm-sp-reddit-hide') as HTMLButtonElement
    hideBtn.click()
    expect(container.querySelectorAll('.gm-sp-reddit-item')).toHaveLength(1)
  })
})
