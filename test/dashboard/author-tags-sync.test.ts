import { describe, expect, test, beforeEach } from 'bun:test'
import { syncAuthorTags } from '../../src/dashboard/author-tags-sync'
import { createRuntime, type TestRuntime } from '../runtime'
import { JSDOM } from 'jsdom'
import type { AuthorTagMap } from '../../src/shared/author-labels'

describe('syncAuthorTags', () => {
  let runtime: TestRuntime
  let target: { map: AuthorTagMap }

  beforeEach(() => {
    const dom = new JSDOM('', { url: 'https://www.reddit.com' })
    runtime = createRuntime(dom)
    target = { map: {} }
    // Clear localStorage
    dom.window.localStorage.clear()
  })

  test('loads from localStorage when on matching domain', async () => {
    const tagData = { alice: { tech: { url: '/t/1', score: 5 } } }
    localStorage.setItem('gm:reddit:author-tags', JSON.stringify(tagData))

    await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
      target,
    })

    expect(target.map).toEqual(tagData)
  })

  test('writes localStorage data to GM storage when on matching domain', async () => {
    const tagData = { alice: { tech: { url: '/t/1', score: 5 } } }
    localStorage.setItem('gm:reddit:author-tags', JSON.stringify(tagData))

    await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
      target,
    })

    expect(runtime.stores['reddit_author_tags']).toEqual(tagData)
  })

  test('falls back to GM storage when not on matching domain', async () => {
    const dom = new JSDOM('', { url: 'https://www.v2ex.com' })
    runtime = createRuntime(dom)
    const tagData = { bob: { news: { url: '/t/2', score: 3 } } }
    runtime.stores['reddit_author_tags'] = tagData

    await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
      target,
    })

    expect(target.map).toEqual(tagData)
  })

  test('uses fallbackGmKey when primary GM key is null', async () => {
    const dom = new JSDOM('', { url: 'https://www.v2ex.com' })
    runtime = createRuntime(dom)
    const tagData = { charlie: { sports: { url: '/t/3', score: -2 } } }
    runtime.stores['v2ex_author_tags_fallback'] = tagData

    await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
      fallbackGmKey: 'v2ex_author_tags_fallback',
      target,
    })

    expect(target.map).toEqual(tagData)
  })

  test('sets empty map when no data found anywhere', async () => {
    const freshDom = new JSDOM('', { url: 'https://www.example.com' })
    const freshRuntime = createRuntime(freshDom)
    const freshTarget: { map: AuthorTagMap } = { map: {} }

    await syncAuthorTags({
      runtime: freshRuntime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
      target: freshTarget,
    })

    expect(freshTarget.map).toEqual({})
  })

  test('sets empty map on error', async () => {
    localStorage.setItem('gm:reddit:author-tags', 'not valid json{{{')

    await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
      target,
    })

    expect(target.map).toEqual({})
  })

  test('skips localStorage when not on matching domain', async () => {
    const dom = new JSDOM('', { url: 'https://www.v2ex.com' })
    runtime = createRuntime(dom)
    localStorage.setItem('gm:reddit:author-tags', JSON.stringify({ should: 'not load' }))
    runtime.stores['reddit_author_tags'] = { from: { gm: { url: '/t/1', score: 1 } } }

    await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'www.reddit.com',
      lsKey: 'gm:reddit:author-tags',
      gmKey: 'reddit_author_tags',
      target,
    })

    // Should use GM storage, not localStorage
    expect(target.map).toEqual({ from: { gm: { url: '/t/1', score: 1 } } })
  })
})
