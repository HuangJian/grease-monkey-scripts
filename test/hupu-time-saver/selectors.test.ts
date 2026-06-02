import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import {
  buildPageUrl,
  extractEuid,
  extractNextData,
  findAllAuthorLinks,
  isAuthorNameLink,
  parseNextData,
  parseReplyList,
} from '../../src/hupu-time-saver/selectors'

function validNextDataJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    props: {
      pageProps: {
        detail: {
          thread: {
            tid: '639668673',
            author: {
              puid: '56098302',
              euid: '27066519444214',
              puname: '虎扑篮球资讯',
              url: 'https://my.hupu.com/27066519444214',
            },
            lights: 23,
            replies: 83,
          },
          replies: {
            count: 83,
            size: 20,
            current: 1,
            total: 5,
            list: [
              {
                pid: '53100',
                authorId: '37171872',
                author: {
                  puid: '37171872',
                  euid: '263977037421524',
                  puname: '骑士热火湖人詹',
                  url: 'https://my.hupu.com/263977037421524',
                },
              },
            ],
          },
        },
      },
    },
    ...overrides,
  }
}

describe('parseNextData', () => {
  test('从有效 JSON 提取 tid、楼主、分页信息', () => {
    const result = parseNextData(validNextDataJson())
    expect(result).not.toBeNull()
    expect(result!.tid).toBe('639668673')
    expect(result!.authorPuid).toBe('56098302')
    expect(result!.authorEuid).toBe('27066519444214')
    expect(result!.authorPuname).toBe('虎扑篮球资讯')
    expect(result!.authorUrl).toBe('https://my.hupu.com/27066519444214')
    expect(result!.currentPage).toBe(1)
    expect(result!.pageCount).toBe(5)
    expect(result!.repliesPerPage).toBe(20)
  })

  test('JSON 无 detail 时返回 null', () => {
    const data = { props: { pageProps: {} } }
    expect(parseNextData(data)).toBeNull()
  })

  test('JSON 结构异常时返回 null', () => {
    expect(parseNextData(null)).toBeNull()
    expect(parseNextData('not an object')).toBeNull()
    expect(parseNextData({})).toBeNull()
  })

  test('thread 缺少 tid 时返回 null', () => {
    const data = validNextDataJson()
    delete (data.props as Record<string, unknown>).pageProps
    expect(parseNextData(data)).toBeNull()
  })
})

describe('parseReplyList', () => {
  test('从有效 replies.list 提取 pid、author', () => {
    const result = parseReplyList(validNextDataJson())
    expect(result).toHaveLength(1)
    expect(result[0].pid).toBe('53100')
    expect(result[0].authorPuid).toBe('37171872')
    expect(result[0].authorEuid).toBe('263977037421524')
    expect(result[0].authorPuname).toBe('骑士热火湖人詹')
  })

  test('list 为空时返回空数组', () => {
    const data = validNextDataJson()
    const detail = (data.props as Record<string, unknown>).pageProps as Record<string, unknown>
    ;(detail.detail as Record<string, unknown>).replies = {
      list: [],
    }
    expect(parseReplyList(data)).toEqual([])
  })

  test('author 字段缺失时跳过该条', () => {
    const data = validNextDataJson()
    const detail = (data.props as Record<string, unknown>).pageProps as Record<string, unknown>
    ;(detail.detail as Record<string, unknown>).replies = {
      list: [{ pid: '1', author: { puid: '100', euid: '200' } }, { pid: '2' }],
    }
    const result = parseReplyList(data)
    expect(result).toHaveLength(1)
    expect(result[0].pid).toBe('1')
  })

  test('输入非对象时返回空数组', () => {
    expect(parseReplyList(null)).toEqual([])
    expect(parseReplyList('string')).toEqual([])
  })
})

describe('extractEuid', () => {
  test('从 my.hupu.com URL 提取 euid', () => {
    expect(extractEuid('https://my.hupu.com/27066519444214')).toBe('27066519444214')
  })

  test('剥离查询参数', () => {
    expect(extractEuid('https://my.hupu.com/27066519444214?from=topic')).toBe('27066519444214')
  })

  test('剥离 fragment', () => {
    expect(extractEuid('https://my.hupu.com/27066519444214#section')).toBe('27066519444214')
  })

  test('URL 无路径时返回空串', () => {
    expect(extractEuid('https://my.hupu.com')).toBe('')
    expect(extractEuid('')).toBe('')
  })
})

describe('isAuthorNameLink', () => {
  test('对 reply-list-user-info-top-name 返回 true', () => {
    const dom = new JSDOM('<a class="post-reply-list-user-info-top-name">昵称</a>')
    const el = dom.window.document.querySelector('a')!
    expect(isAuthorNameLink(el)).toBe(true)
  })

  test('对 avatar 链接返回 false', () => {
    const dom = new JSDOM('<a class="reply-list-avatar-wrapper"><img></a>')
    const el = dom.window.document.querySelector('a')!
    expect(isAuthorNameLink(el)).toBe(false)
  })

  test('对 OP 链接返回 true', () => {
    const dom = new JSDOM('<a class="post-user_post-user-comp-info-top-name__N3D4w">楼主</a>')
    const el = dom.window.document.querySelector('a')!
    expect(isAuthorNameLink(el)).toBe(true)
  })

  test('对无关链接返回 false', () => {
    const dom = new JSDOM('<a class="some-other-link">其他</a>')
    const el = dom.window.document.querySelector('a')!
    expect(isAuthorNameLink(el)).toBe(false)
  })
})

describe('findAllAuthorLinks', () => {
  test('找到所有 my.hupu.com 链接', () => {
    const dom = new JSDOM(`
      <div>
        <a href="https://my.hupu.com/111">用户A</a>
        <a href="https://my.hupu.com/222">用户B</a>
        <a href="https://other.com/user">其他</a>
      </div>
    `)
    const links = findAllAuthorLinks(dom.window.document.body)
    expect(links).toHaveLength(2)
  })
})

describe('extractNextData', () => {
  test('从文档中提取 __NEXT_DATA__ JSON', () => {
    const data = { key: 'value' }
    const dom = new JSDOM(`
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>
      </body></html>
    `)
    const result = extractNextData(dom.window.document)
    expect(result).toEqual(data)
  })

  test('没有 __NEXT_DATA__ 时返回 null', () => {
    const dom = new JSDOM('<html><body></body></html>')
    expect(extractNextData(dom.window.document)).toBeNull()
  })

  test('JSON 格式错误时返回 null', () => {
    const dom = new JSDOM(`
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">{invalid}</script>
      </body></html>
    `)
    expect(extractNextData(dom.window.document)).toBeNull()
  })
})

describe('buildPageUrl', () => {
  test('构造正确的分页 URL', () => {
    const url = buildPageUrl('639668673', 2)
    expect(url).toBe('https://bbs.hupu.com/639668673-2.html')
  })
})
