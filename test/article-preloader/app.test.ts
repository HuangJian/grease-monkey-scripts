import { describe, expect, test, afterAll } from 'bun:test'

import { getLinkText, isAbsoluteUrl, toAbsoluteUrl, matchesText } from '../../src/utils'
import {
  findChapterLink,
  selectorsFactory,
  startArticlePreloader,
} from '../../src/article-preloader/app'
import type { RequestDetails } from '../../src/runtime'
import { createHappyDom, createRuntime, closeAllWindows } from '../runtime'

describe('pure helpers', () => {
  test('getLinkText strips all whitespace', () => {
    const dom = createHappyDom('<html><body><a href="#">  hello  world  </a></body></html>')
    const link = dom.document.querySelector('a')! as unknown as Element
    expect(getLinkText(link)).toBe('helloworld')
  })

  test('getLinkText returns empty for null', () => {
    expect(getLinkText(null)).toBe('')
  })

  test('isAbsoluteUrl detects absolute urls', () => {
    expect(isAbsoluteUrl('https://example.com')).toBe(true)
    expect(isAbsoluteUrl('http://example.com')).toBe(true)
    expect(isAbsoluteUrl('/chapter/2')).toBe(false)
    expect(isAbsoluteUrl('chapter/2')).toBe(false)
  })

  test('toAbsoluteUrl resolves relative urls', () => {
    expect(toAbsoluteUrl('https://example.com', 'https://base.com')).toBe('https://example.com')
    expect(toAbsoluteUrl('/chapter/2', 'https://www.sudugu.org/chapter/1')).toBe(
      'https://www.sudugu.org/chapter/2',
    )
    expect(toAbsoluteUrl('', 'https://base.com')).toBe('')
    expect(toAbsoluteUrl(null, 'https://base.com')).toBe('')
  })

  test('matchesText works with regex and function matchers', () => {
    expect(matchesText(/下一章/, '下一章')).toBe(true)
    expect(matchesText(/下一章/, '上一章')).toBe(false)
    expect(matchesText((t) => t.includes('下'), '下一页')).toBe(true)
    expect(matchesText((t) => t.includes('下'), '上一页')).toBe(false)
  })

  test('findChapterLink finds link by text pattern', () => {
    const dom = createHappyDom(`
      <html><body>
        <div class="nav">
          <a href="/prev">上一章</a>
          <a href="/index">目录</a>
          <a href="/next">下一章</a>
        </div>
      </body></html>
    `)
    const doc = dom.document as unknown as Document
    const link = findChapterLink('.nav a', [/下一章/], doc)
    expect(link?.getAttribute('href')).toBe('/next')
  })

  test('findChapterLink returns null when no match', () => {
    const dom = createHappyDom(`
      <html><body><div class="nav"><a href="/prev">上一章</a></div></body></html>
    `)
    const doc = dom.document as unknown as Document
    expect(findChapterLink('.nav a', [/下一章/], doc)).toBeNull()
  })
})

describe('selectorsFactory', () => {
  test('creates text-pattern selectors for sudugu.org', () => {
    const dom = createHappyDom(
      `
      <html><body>
        <div class="prenext">
          <a href="/prev">上一章</a>
          <a href="/index">目录</a>
          <a href="/next">下一章</a>
        </div>
        <div class="con">content</div>
      </body></html>
    `,
      'https://www.sudugu.org/chapter/1',
    )
    const factory = selectorsFactory('www.sudugu.org', dom.document as unknown as Document)

    expect(factory.contentSelector).toBe('.con')
    expect(factory.previousChapterLinkSelector()?.getAttribute('href')).toBe('/prev')
    expect(factory.indexLinkSelector()?.getAttribute('href')).toBe('/index')
    expect(factory.nextChapterLinkSelector()?.getAttribute('href')).toBe('/next')
    expect(factory.paginationSelector).toBe('.prenext a')
    expect(factory.matchContinuationText('下一页')).toBe(true)
    expect(factory.matchNextChapterText('下一章')).toBe(true)
  })

  test('creates direct selectors for xbiquge.so', () => {
    const dom = createHappyDom(
      `
      <html><body>
        <a id="link-preview" href="/prev">上一章</a>
        <a id="link-index" href="/index">目录</a>
        <a id="link-next" href="/next">下一章</a>
        <div id="content">content</div>
      </body></html>
    `,
      'https://www.xbiquge.so/book/1/1.html',
    )
    const factory = selectorsFactory('www.xbiquge.so', dom.document as unknown as Document)

    expect(factory.contentSelector).toBe('#content')
    expect(factory.previousChapterLinkSelector()?.getAttribute('href')).toBe('/prev')
    expect(factory.indexLinkSelector()?.getAttribute('href')).toBe('/index')
    expect(factory.nextChapterLinkSelector()?.getAttribute('href')).toBe('/next')
  })

  test('throws for unsupported host', () => {
    const dom = createHappyDom('<html><body></body></html>')
    expect(() => selectorsFactory('example.com', dom.document as unknown as Document)).toThrow(
      'Unsupported website',
    )
  })
})

describe('loadChapter', () => {
  test('loads a single-page chapter without continuation', () => {
    const chapterHtml = `
      <html><head></head><body>
        <div class="con">Chapter content here</div>
        <div class="prenext">
          <a href="/prev">上一章</a>
          <a href="/index">目录</a>
          <a href="/next">下一章</a>
        </div>
      </body></html>
    `
    const dom = createHappyDom('<html><body></body></html>', 'https://www.sudugu.org/chapter/1')
    const requests: string[] = []
    const runtime = {
      ...createRuntime(dom),
      request: ({ url, onload }: { url: string; onload: RequestDetails['onload'] }) => {
        requests.push(url)
        onload({ responseText: chapterHtml, status: 200, responseHeaders: '' })
      },
    }

    let result: { html: string; url: string; nextChapterUrl: string } | null = null
    const app = startArticlePreloader(runtime)

    app.loadChapter(
      '/chapter/1',
      (r) => {
        result = r
      },
      () => {},
    )

    expect(result).not.toBeNull()
    expect(result!.url).toBe('https://www.sudugu.org/chapter/1')
    expect(result!.nextChapterUrl).toBe('https://www.sudugu.org/next')
    expect(result!.html).toContain('Chapter content here')
    expect(result!.html).toMatch(/^<!DOCTYPE html>/)
  })

  test('merges continuation pages into a single chapter', () => {
    const page1Html = `
      <html><head></head><body>
        <div class="con">Page 1 content</div>
        <div class="prenext">
          <a href="/chapter/1?p=2">下一页</a>
          <a href="/chapter/2">下一章</a>
        </div>
      </body></html>
    `
    const page2Html = `
      <html><head></head><body>
        <div class="con">Page 2 content</div>
        <div class="prenext">
          <a href="/chapter/2">下一章</a>
        </div>
      </body></html>
    `
    const dom = createHappyDom('<html><body></body></html>', 'https://www.sudugu.org/chapter/1')
    const runtime = {
      ...createRuntime(dom),
      request: ({ url, onload }: { url: string; onload: RequestDetails['onload'] }) => {
        if (url.includes('p=2')) {
          onload({ responseText: page2Html, status: 200, responseHeaders: '' })
        } else {
          onload({ responseText: page1Html, status: 200, responseHeaders: '' })
        }
      },
    }

    let result: { html: string; url: string; nextChapterUrl: string } | null = null
    const app = startArticlePreloader(runtime)

    app.loadChapter(
      '/chapter/1',
      (r) => {
        result = r
      },
      () => {},
    )

    expect(result).not.toBeNull()
    expect(result!.html).toContain('Page 1 content')
    expect(result!.html).toContain('Page 2 content')
    expect(result!.nextChapterUrl).toBe('https://www.sudugu.org/chapter/2')
  })

  test('calls onFailure on request error', () => {
    const dom = createHappyDom('<html><body></body></html>', 'https://www.sudugu.org/chapter/1')
    const runtime = {
      ...createRuntime(dom),
      request: ({ onerror }: { onerror?: () => void }) => {
        onerror?.()
      },
    }

    let failed = false
    const app = startArticlePreloader(runtime)

    app.loadChapter(
      '/chapter/1',
      () => {},
      () => {
        failed = true
      },
    )

    expect(failed).toBe(true)
  })

  test('skips preload silently when content element is missing on 200', () => {
    const badHtml = `<html><head></head><body><div class="nav"><a href="/next">下一章</a></div></body></html>`
    const dom = createHappyDom('<html><body></body></html>', 'https://www.sudugu.org/chapter/1')
    let succeeded = false
    let failed = false
    const runtime = {
      ...createRuntime(dom),
      request: ({ onload }: { onload: RequestDetails['onload'] }) => {
        onload({ responseText: badHtml, status: 200, responseHeaders: '' })
      },
    }

    const app = startArticlePreloader(runtime)

    app.loadChapter(
      '/chapter/1',
      () => {
        succeeded = true
      },
      () => {
        failed = true
      },
    )

    expect(succeeded).toBe(false)
    expect(failed).toBe(false)
  })

  test('calls onFailure when content element is missing on non-200', () => {
    const badHtml = `<html><head></head><body><div class="nav"><a href="/next">下一章</a></div></body></html>`
    const dom = createHappyDom('<html><body></body></html>', 'https://www.sudugu.org/chapter/1')
    let failed = false
    const runtime = {
      ...createRuntime(dom),
      request: ({ onload }: { onload: RequestDetails['onload'] }) => {
        onload({ responseText: badHtml, status: 404, responseHeaders: '' })
      },
    }

    const app = startArticlePreloader(runtime)

    app.loadChapter(
      '/chapter/1',
      () => {},
      () => {
        failed = true
      },
    )

    expect(failed).toBe(true)
  })

  test('replaces first-page 下一页 with 下一章 when the chapter has pagination', () => {
    const page1Html = `
      <html><head></head><body>
        <div class="con">Page 1 content</div>
        <div class="prenext">
          <a href="/chapter/1?p=2">下一页</a>
        </div>
      </body></html>
    `
    const page2Html = `
      <html><head></head><body>
        <div class="con">Page 2 content</div>
        <div class="prenext">
          <a href="/chapter/1?p=3">下一页</a>
        </div>
      </body></html>
    `
    const page3Html = `
      <html><head></head><body>
        <div class="con">Page 3 content</div>
        <div class="prenext">
          <a href="/chapter/4">下一章</a>
        </div>
      </body></html>
    `
    const dom = createHappyDom('<html><body></body></html>', 'https://www.sudugu.org/chapter/1')
    const requests: Array<{ url: string; onload: RequestDetails['onload'] }> = []
    const runtime = {
      ...createRuntime(dom),
      request: ({ url, onload }: { url: string; onload: RequestDetails['onload'] }) => {
        requests.push({ url, onload })
      },
    }

    let result: { html: string; url: string; nextChapterUrl: string } | null = null
    const app = startArticlePreloader(runtime)

    app.loadChapter(
      '/chapter/1',
      (r) => {
        result = r
      },
      () => {},
    )

    // Trigger the chain of continuation fetches
    for (const req of requests) {
      if (req.url.includes('p=2')) {
        req.onload({ responseText: page2Html, status: 200, responseHeaders: '' })
      } else if (req.url.includes('p=3')) {
        req.onload({ responseText: page3Html, status: 200, responseHeaders: '' })
      } else {
        req.onload({ responseText: page1Html, status: 200, responseHeaders: '' })
      }
    }

    expect(result).not.toBeNull()
    expect(result!.html).toContain('Page 1 content')
    expect(result!.html).toContain('Page 2 content')
    expect(result!.html).toContain('Page 3 content')
    expect(result!.nextChapterUrl).toBe('https://www.sudugu.org/chapter/4')

    // The output HTML should have a "下一章" link (replacing the original "下一页")
    const resultDom = createHappyDom(result!.html, 'https://www.sudugu.org/chapter/1')
    const navLinks = Array.from(resultDom.window.document.querySelectorAll('.prenext a'))
    const nextLinks = navLinks.filter((a) => a.textContent?.trim() === '下一章')
    expect(nextLinks).toHaveLength(1)
    expect(nextLinks[0].getAttribute('href')).toBe('https://www.sudugu.org/chapter/4')
    const continuationLinks = navLinks.filter((a) => a.textContent?.trim() === '下一页')
    expect(continuationLinks).toHaveLength(0)
  })

  test('prevents infinite loop on circular continuation links', () => {
    const circularHtml = `
      <html><head></head><body>
        <div class="con">content</div>
        <div class="prenext">
          <a href="/chapter/1">下一页</a>
          <a href="/chapter/2">下一章</a>
        </div>
      </body></html>
    `
    const dom = createHappyDom('<html><body></body></html>', 'https://www.sudugu.org/chapter/1')
    const runtime = {
      ...createRuntime(dom),
      request: ({ onload }: { onload: RequestDetails['onload'] }) => {
        onload({ responseText: circularHtml, status: 200, responseHeaders: '' })
      },
    }

    let result: { html: string; url: string; nextChapterUrl: string } | null = null
    const app = startArticlePreloader(runtime)

    app.loadChapter(
      '/chapter/1',
      (r) => {
        result = r
      },
      () => {},
    )

    expect(result).not.toBeNull()
    expect(result!.html).toContain('content')
  })
})

describe('mergeCurrentChapterIfNeeded', () => {
  test('skips merge when no continuation link exists', () => {
    const html = `
      <html><head></head><body>
        <div class="con">content</div>
        <div class="prenext">
          <a href="/next">下一章</a>
        </div>
      </body></html>
    `
    const dom = createHappyDom(html, 'https://www.sudugu.org/chapter/1')
    let doneCalled = false
    const app = startArticlePreloader(createRuntime(dom))

    app.mergeCurrentChapterIfNeeded(() => {
      doneCalled = true
    })

    expect(doneCalled).toBe(true)
  })

  test('merges continuation pages when continuation link exists', () => {
    const currentHtml = `
      <html><head></head><body>
        <div class="con">Page 1</div>
        <div class="prenext">
          <a href="/chapter/1?p=2">下一页</a>
          <a href="/chapter/2">下一章</a>
        </div>
      </body></html>
    `
    const page2Html = `
      <html><head></head><body>
        <div class="con">Page 2</div>
        <div class="prenext">
          <a href="/chapter/2">下一章</a>
        </div>
      </body></html>
    `
    const dom = createHappyDom(currentHtml, 'https://www.sudugu.org/chapter/1')
    const runtime = {
      ...createRuntime(dom),
      request: ({ url, onload }: { url: string; onload: RequestDetails['onload'] }) => {
        if (url.includes('p=2')) {
          onload({ responseText: page2Html, status: 200, responseHeaders: '' })
        } else {
          onload({ responseText: currentHtml, status: 200, responseHeaders: '' })
        }
      },
    }

    let doneCalled = false
    const app = startArticlePreloader(runtime)

    app.mergeCurrentChapterIfNeeded(() => {
      doneCalled = true
    })

    expect(doneCalled).toBe(true)
    const content = dom.document.querySelector('.con')?.textContent
    expect(content).toContain('Page 1')
    expect(content).toContain('Page 2')
  })
})

describe('integration: startArticlePreloader', () => {
  test('preloads next chapter and replaces the link', () => {
    const currentHtml = `
      <html><head></head><body>
        <div class="con">Current chapter</div>
        <div class="prenext">
          <a href="/chapter/2">下一章</a>
        </div>
      </body></html>
    `
    const nextHtml = `
      <html><head></head><body>
        <div class="con">Next chapter</div>
        <div class="prenext">
          <a href="/chapter/3">下一章</a>
        </div>
      </body></html>
    `
    const dom = createHappyDom(currentHtml, 'https://www.sudugu.org/chapter/1')
    const requestUrls: string[] = []
    const runtime = {
      ...createRuntime(dom),
      request: ({ url, onload }: { url: string; onload: RequestDetails['onload'] }) => {
        requestUrls.push(url)
        if (url.includes('chapter/2')) {
          onload({ responseText: nextHtml, status: 200, responseHeaders: '' })
        }
      },
    }

    startArticlePreloader(runtime)

    expect(requestUrls.some((u) => u.includes('chapter/2'))).toBe(true)
    const nextLink = dom.document.querySelector('.prenext a')!
    expect(nextLink.textContent).toBe('下一章')
  })

  test('skips preload when on a page without next chapter link', () => {
    const html = `
      <html><head></head><body>
        <div class="con">Last chapter</div>
        <div class="prenext">
          <a href="/chapter/1">上一章</a>
          <a href="/index">目录</a>
        </div>
      </body></html>
    `
    const dom = createHappyDom(html, 'https://www.sudugu.org/chapter/5')
    const requestUrls: string[] = []
    const runtime = {
      ...createRuntime(dom),
      request: ({ url }: { url: string }) => {
        requestUrls.push(url)
      },
    }

    startArticlePreloader(runtime)

    expect(requestUrls).toHaveLength(0)
  })
})

afterAll(() => closeAllWindows())
