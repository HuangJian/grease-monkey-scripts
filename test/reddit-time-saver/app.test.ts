import { beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import {
  BTN_CLASS,
  createRedditApp,
  getAuthorName,
  getCommentId,
  PROCESSED_CLASS,
  STORAGE_KEY,
} from '../../src/reddit-time-saver/app'
import { createDom, createRuntime } from '../runtime'

function oldRedditHtml() {
  return `<!doctype html>
<html><head></head><body>
<div class="commentarea">
  <div class="thing" id="thing_t1_abc1">
    <div class="entry">
      <p class="tagline">
        <a class="author" href="/user/alice">alice</a>
        <span class="score">5 points</span>
      </p>
      <div class="md"><p>comment one</p></div>
    </div>
  </div>
  <div class="thing" id="thing_t1_abc2">
    <div class="entry">
      <p class="tagline">
        <a class="author" href="/user/bob">bob</a>
        <span class="score">3 points</span>
      </p>
      <div class="md"><p>comment two</p></div>
    </div>
  </div>
</div>
</body></html>`
}

describe('getAuthorName', () => {
  test('extracts username from standard Reddit author link', () => {
    const dom = new JSDOM('<a href="/user/testuser">testuser</a>')
    const link = dom.window.document.querySelector('a')!
    expect(getAuthorName(link)).toBe('testuser')
  })

  test('extracts username with trailing slash', () => {
    const dom = new JSDOM('<a href="/user/testuser/">testuser</a>')
    const link = dom.window.document.querySelector('a')!
    expect(getAuthorName(link)).toBe('testuser')
  })

  test('extracts username from full URL', () => {
    const dom = new JSDOM('<a href="https://www.reddit.com/user/testuser/">testuser</a>')
    const link = dom.window.document.querySelector('a')!
    expect(getAuthorName(link)).toBe('testuser')
  })

  test('returns empty string for non-user link', () => {
    const dom = new JSDOM('<a href="/r/programming">programming</a>')
    const link = dom.window.document.querySelector('a')!
    expect(getAuthorName(link)).toBe('')
  })

  test('handles username with special characters', () => {
    const dom = new JSDOM('<a href="/user/user_name-123/">user_name-123</a>')
    const link = dom.window.document.querySelector('a')!
    expect(getAuthorName(link)).toBe('user_name-123')
  })
})

describe('getCommentId', () => {
  test('extracts ID from old Reddit thing element', () => {
    const dom = new JSDOM(`
      <div class="thing" id="thing_t1_abc123">
        <div class="entry">
          <p class="tagline"><a href="/user/alice">alice</a></p>
        </div>
      </div>
    `)
    const link = dom.window.document.querySelector('a')!
    expect(getCommentId(link)).toBe('thing_t1_abc123')
  })

  test('extracts ID from new Reddit shreddit-comment', () => {
    const dom = new JSDOM(`
      <shreddit-comment id="t1_abc123">
        <a href="/user/alice">alice</a>
      </shreddit-comment>
    `)
    const link = dom.window.document.querySelector('a')!
    expect(getCommentId(link)).toBe('t1_abc123')
  })

  test('returns empty when no comment container found', () => {
    const dom = new JSDOM('<a href="/user/alice">alice</a>')
    const link = dom.window.document.querySelector('a')!
    expect(getCommentId(link)).toBe('')
  })
})

describe('createRedditApp', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = createDom(oldRedditHtml(), 'https://old.reddit.com/r/test/comments/xyz/')
  })

  test('attaches tag buttons to author links', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createRedditApp(runtime)
    app.start()

    const authorLinks = dom.window.document.querySelectorAll('a.author')
    authorLinks.forEach((link) => {
      const btn = link.nextElementSibling
      expect(btn?.classList.contains(BTN_CLASS)).toBe(true)
      expect(link.classList.contains(PROCESSED_CLASS)).toBe(true)
    })
  })

  test('does not process already processed links', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createRedditApp(runtime)

    const authorLink = dom.window.document.querySelector('a.author')!
    authorLink.classList.add(PROCESSED_CLASS)
    app.start()

    const btn = authorLink.nextElementSibling
    expect(btn?.classList.contains(BTN_CLASS)).toBe(false)
  })

  test('highlights comment content for tagged users', async () => {
    const values: Record<string, unknown> = {
      [STORAGE_KEY]: {
        alice: { 低质: { url: 'r/test/comments/xyz/t1_abc1/', score: -1 } },
      },
    }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createRedditApp(runtime)
    app.start()

    const md = dom.window.document.querySelector('.md')!
    expect(md.classList.contains('gm-highlight-n1')).toBe(true)
    const tag = dom.window.document.querySelector('.gm-author-tag')
    expect(tag?.textContent).toBe('低质')
    expect((tag as HTMLElement)?.style.color).toBe('red')
    const bobMd = dom.window.document.querySelectorAll('.md')[1]
    expect(bobMd.classList.contains('gm-highlight-n1')).toBe(false)
  })

  test('highlights with score-based background intensity', async () => {
    const values: Record<string, unknown> = {
      [STORAGE_KEY]: {
        alice: {
          优质: { url: 'r/test/comments/xyz/t1_abc1/', score: 1 },
          helpful: { url: 'r/test/comments/xyz/t1_abc1/', score: 2 },
        },
      },
    }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createRedditApp(runtime)
    app.start()

    const md = dom.window.document.querySelector('.md')!
    expect(md.classList.contains('gm-highlight-3')).toBe(true)
  })

  test('processElement handles newly added nodes', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createRedditApp(runtime)

    const container = dom.window.document.querySelector('.commentarea')!
    const newThing = dom.window.document.createElement('div')
    newThing.className = 'thing'
    newThing.id = 'thing_t1_abc3'
    newThing.innerHTML = `
      <div class="entry">
        <p class="tagline">
          <a class="author" href="/user/carol">carol</a>
        </p>
      </div>
    `
    container.appendChild(newThing)

    app.processElement(container)

    const carolLink = dom.window.document.querySelector('a[href="/user/carol"]')!
    expect(carolLink.classList.contains(PROCESSED_CLASS)).toBe(true)
    const btn = carolLink.nextElementSibling
    expect(btn?.classList.contains(BTN_CLASS)).toBe(true)
  })

  test('tagAuthor modifies stored tags and re-applies highlights', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createRedditApp(runtime)
    app.start()

    app.tagAuthor('alice', 'thing_t1_abc1', '低质', -1)

    const map = app.getAuthorTagMap()
    expect(map.alice).toBeDefined()
    expect(map.alice!['低质']?.score).toBe(-1)

    const md = dom.window.document.querySelector('.md')!
    expect(md.classList.contains('gm-highlight-n1')).toBe(true)
  })

  test('setTag creates a tag with exact score', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createRedditApp(runtime)

    app.setTag('bob', '优质', 5, 'thing_t1_abc2')

    const map = app.getAuthorTagMap()
    expect(map.bob!['优质']?.score).toBe(5)
  })

  test('unsetTag removes a tag', async () => {
    const values: Record<string, unknown> = {
      [STORAGE_KEY]: {
        alice: { 低质: { url: 'r/test/comments/xyz/t1_abc1/', score: -1 } },
      },
    }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createRedditApp(runtime)

    app.unsetTag('alice', '低质')

    const map = app.getAuthorTagMap()
    expect(map.alice).toBeUndefined()
  })
})
