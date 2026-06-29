import { describe, expect, test, beforeEach, afterAll } from 'bun:test'
import { syncAuthorTags } from '../../src/prism/author-tags-sync'
import { createHappyDom, createRuntime, type TestRuntime, closeAllWindows } from '../runtime'

describe('syncAuthorTags', () => {
  let runtime: TestRuntime

  beforeEach(() => {
    const dom = createHappyDom('', 'https://www.reddit.com')
    runtime = createRuntime(dom)
    dom.localStorage.clear()
  })

  test('loads from localStorage when on matching domain', async () => {
    const tagData = { alice: { tech: { url: '/t/1', score: 5 } } }
    runtime.localStorage.setItem('gm:reddit:author-tags', JSON.stringify(tagData))

    const result = await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
    })

    expect(result).toEqual(tagData)
  })

  test('writes localStorage data to GM storage when on matching domain', async () => {
    const tagData = { alice: { tech: { url: '/t/1', score: 5 } } }
    runtime.localStorage.setItem('gm:reddit:author-tags', JSON.stringify(tagData))

    await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
    })

    expect(runtime.stores['reddit_author_tags']).toEqual(tagData)
  })

  test('falls back to GM storage when not on matching domain', async () => {
    const dom = createHappyDom('', 'https://www.v2ex.com')
    runtime = createRuntime(dom)
    const tagData = { bob: { news: { url: '/t/2', score: 3 } } }
    runtime.stores['reddit_author_tags'] = tagData

    const result = await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
    })

    expect(result).toEqual(tagData)
  })

  test('uses fallbackGmKey when primary GM key is null', async () => {
    const dom = createHappyDom('', 'https://www.v2ex.com')
    runtime = createRuntime(dom)
    const tagData = { charlie: { sports: { url: '/t/3', score: -2 } } }
    runtime.stores['v2ex_author_tags_fallback'] = tagData

    const result = await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
      fallbackGmKey: 'v2ex_author_tags_fallback',
    })

    expect(result).toEqual(tagData)
  })

  test('returns empty map when no data found anywhere', async () => {
    const freshDom = createHappyDom('', 'https://www.example.com')
    const freshRuntime = createRuntime(freshDom)

    const result = await syncAuthorTags({
      runtime: freshRuntime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
    })

    expect(result).toEqual({})
  })

  test('returns empty map on error', async () => {
    runtime.localStorage.setItem('gm:reddit:author-tags', 'not valid json{{{')

    const result = await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
    })

    expect(result).toEqual({})
  })

  test('loads from v2ex-time-saver GM key when not on v2ex domain', async () => {
    const dom = createHappyDom('', 'https://www.example.com')
    runtime = createRuntime(dom)
    const tagData = { dave: { python: { url: '/t/4', score: 7 } } }
    runtime.stores['author_tags'] = tagData

    const result = await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.v2ex.com' || h.endsWith('.v2ex.com'),
      lsKey: 'gm:v2ex:author-tags',
      gmKey: 'v2ex_author_tags',
      fallbackGmKey: 'author_tags',
    })

    expect(result).toEqual(tagData)
  })

  test('prefers dashboard GM key over v2ex-time-saver key', async () => {
    const dom = createHappyDom('', 'https://www.example.com')
    runtime = createRuntime(dom)
    const dashboardTags = { from: { dashboard: { url: '/t/1', score: 2 } } }
    const v2exTags = { from: { v2exsaver: { url: '/t/2', score: 3 } } }
    runtime.stores['v2ex_author_tags'] = dashboardTags
    runtime.stores['author_tags'] = v2exTags

    const result = await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.v2ex.com' || h.endsWith('.v2ex.com'),
      lsKey: 'gm:v2ex:author-tags',
      gmKey: 'v2ex_author_tags',
      fallbackGmKey: 'author_tags',
    })

    expect(result).toEqual(dashboardTags)
  })

  test('skips localStorage when not on matching domain', async () => {
    const dom = createHappyDom('', 'https://www.v2ex.com')
    runtime = createRuntime(dom)
    runtime.localStorage.setItem('gm:reddit:author-tags', JSON.stringify({ should: 'not load' }))
    runtime.stores['reddit_author_tags'] = { from: { gm: { url: '/t/1', score: 1 } } }

    const result = await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
    })

    expect(result).toEqual({ from: { gm: { url: '/t/1', score: 1 } } })
  })
})

afterAll(() => closeAllWindows())
