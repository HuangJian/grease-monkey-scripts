import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  BTN_CLASS,
  createRedditApp,
  PROCESSED_CLASS,
  STORAGE_KEY,
} from '../../src/reddit-time-saver/app'
import { getAuthorName, getCommentId } from '../../src/reddit-time-saver/app/author-utils'
import { createDom, createHappyDom, createRuntime, closeAllWindows } from '../runtime'

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
    const dom = createHappyDom('<a href="/user/testuser">testuser</a>')
    const link = dom.document.querySelector('a')! as unknown as Element
    expect(getAuthorName(link)).toBe('testuser')
  })

  test('extracts username with trailing slash', () => {
    const dom = createHappyDom('<a href="/user/testuser/">testuser</a>')
    const link = dom.document.querySelector('a')! as unknown as Element
    expect(getAuthorName(link)).toBe('testuser')
  })

  test('extracts username from full URL', () => {
    const dom = createHappyDom('<a href="https://www.reddit.com/user/testuser/">testuser</a>')
    const link = dom.document.querySelector('a')! as unknown as Element
    expect(getAuthorName(link)).toBe('testuser')
  })

  test('returns empty string for non-user link', () => {
    const dom = createHappyDom('<a href="/r/programming">programming</a>')
    const link = dom.document.querySelector('a')! as unknown as Element
    expect(getAuthorName(link)).toBe('')
  })

  test('handles username with special characters', () => {
    const dom = createHappyDom('<a href="/user/user_name-123/">user_name-123</a>')
    const link = dom.document.querySelector('a')! as unknown as Element
    expect(getAuthorName(link)).toBe('user_name-123')
  })
})

describe('getCommentId', () => {
  test('extracts ID from old Reddit thing element', () => {
    const dom = createHappyDom(`
      <div class="thing" id="thing_t1_abc123">
        <div class="entry">
          <p class="tagline"><a href="/user/alice">alice</a></p>
        </div>
      </div>
    `)
    const link = dom.document.querySelector('a')! as unknown as Element
    expect(getCommentId(link)).toBe('thing_t1_abc123')
  })

  test('extracts ID from new Reddit shreddit-comment', () => {
    const dom = createHappyDom(`
      <shreddit-comment id="t1_abc123">
        <a href="/user/alice">alice</a>
      </shreddit-comment>
    `)
    const link = dom.document.querySelector('a')! as unknown as Element
    expect(getCommentId(link)).toBe('t1_abc123')
  })

  test('returns empty when no comment container found', () => {
    const dom = createHappyDom('<a href="/user/alice">alice</a>')
    const link = dom.document.querySelector('a')! as unknown as Element
    expect(getCommentId(link)).toBe('')
  })
})

describe('createRedditApp', () => {
  let dom: ReturnType<typeof createDom>

  beforeEach(() => {
    dom = createDom(oldRedditHtml(), 'https://old.reddit.com/r/test/comments/xyz/')
  })

  afterEach(() => {
    dom.window.close()
  })

  test('attaches tag buttons to author links', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createRedditApp(runtime)
    app.start()
    app.stop()

    const authorLinks = dom.document.querySelectorAll('a.author')
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

    const authorLink = dom.document.querySelector('a.author')! as unknown as Element
    authorLink.classList.add(PROCESSED_CLASS)
    app.start()
    app.stop()

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
    app.stop()

    const md = dom.document.querySelector('.md')! as unknown as Element
    expect(md.classList.contains('gm-highlight-n1')).toBe(true)
    const tag = dom.document.querySelector('.gm-author-tag')
    expect(tag?.textContent).toBe('低质')
    expect((tag as unknown as unknown as HTMLElement)?.style.color).toBe('red')
    const bobMd = dom.document.querySelectorAll('.md')[1]
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
    app.stop()

    const md = dom.document.querySelector('.md')! as unknown as Element
    expect(md.classList.contains('gm-highlight-3')).toBe(true)
  })

  test('processElement handles newly added nodes', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createRedditApp(runtime)

    const container = dom.document.querySelector('.commentarea')! as unknown as Element
    const newThing = dom.document.createElement('div')
    newThing.className = 'thing'
    newThing.id = 'thing_t1_abc3'
    newThing.innerHTML = `
      <div class="entry">
        <p class="tagline">
          <a class="author" href="/user/carol">carol</a>
        </p>
      </div>
    `
    container.appendChild(newThing as unknown as Node)

    app.processElement(container as unknown as Node)

    const carolLink = dom.document.querySelector('a[href="/user/carol"]')! as unknown as Element
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
    app.stop()

    app.tagAuthor('alice', 'thing_t1_abc1', '低质', -1)

    const map = app.getAuthorTagMap()
    expect(map.alice).toBeDefined()
    expect(map.alice!['低质']?.score).toBe(-1)

    const md = dom.document.querySelector('.md')! as unknown as Element
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

afterAll(() => closeAllWindows())
