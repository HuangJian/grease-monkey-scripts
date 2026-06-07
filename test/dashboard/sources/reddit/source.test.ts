import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateConfig } from '../../../../src/dashboard/config'
import { createRedditSource } from '../../../../src/dashboard/reddit/source'
import type { RedditSourceOptions } from '../../../../src/dashboard/reddit/types'
import type { RequestDetails } from '../../../../src/runtime'
import { createRuntime, type TestRuntime } from '../../../runtime'

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

function loadFixture(): unknown {
  const text = readFileSync(
    join(import.meta.dir, '..', '..', 'fixtures', 'reddit-popular.json'),
    'utf8',
  )
  return JSON.parse(text)
}

function makeRuntime(dom: JSDOM, handler: (d: RequestDetails) => void): TestRuntime {
  const base = createRuntime(dom)
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

describe('createRedditSource', () => {
  test('source metadata is correct', () => {
    const source = createRedditSource(defaultRedditOpts())
    expect(source.id).toBe('reddit')
    expect(source.title).toBe('Reddit 热帖')
    expect(source.groupId).toBe('browse')
    expect(source.order).toBe(2)
    expect(source.ttlMs).toBe(30 * 60_000)
    expect(typeof source.createEditor).toBe('function')
  })
})

describe('createRedditSource.fetch reads fresh config', () => {
  test('fetch uses subreddits from CONFIG_KEY, not stale closure options', async () => {
    const dom = makeDom()
    const json = loadFixture()
    const fetchedUrls: string[] = []
    const runtime = makeRuntime(dom, (d) => {
      fetchedUrls.push(d.url)
      d.onload({ responseText: JSON.stringify(json) })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['popular'] }))
    runtime.stores['dashboard:v1:config'] = {
      reddit: { subreddits: ['funny'] },
    }
    await source.fetch(runtime, undefined)
    expect(fetchedUrls.every((u) => u.includes('/r/funny/'))).toBe(true)
    expect(fetchedUrls.some((u) => u.includes('/r/popular/'))).toBe(false)
  })

  test('fetch falls back to closure options when CONFIG_KEY has no reddit config', async () => {
    const dom = makeDom()
    const json = loadFixture()
    const fetchedUrls: string[] = []
    const runtime = makeRuntime(dom, (d) => {
      fetchedUrls.push(d.url)
      d.onload({ responseText: JSON.stringify(json) })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['popular'] }))
    await source.fetch(runtime, undefined)
    expect(fetchedUrls.every((u) => u.includes('/r/popular/'))).toBe(true)
  })
})

describe('validateConfig.reddit', () => {
  test('accepts default config', () => {
    expect(
      validateConfig({
        reddit: {
          ttlMinutes: 30,
          subreddits: ['popular'],
          minItems: 10,
          maxItems: 30,
          displayRatio: 0.1,
          elbowDropRatio: 0.4,
          minCutoffScore: 500,
        },
      }),
    ).toEqual({ ok: true })
  })
  test('rejects non-object reddit', () => {
    expect(validateConfig({ reddit: 'no' }).ok).toBe(false)
  })
  test('rejects empty subreddits', () => {
    expect(
      validateConfig({
        reddit: { subreddits: [], minItems: 1, maxItems: 1, ttlMinutes: 1, minCutoffScore: 0 },
      }).ok,
    ).toBe(false)
  })
  test('rejects blank subreddit name', () => {
    expect(
      validateConfig({
        reddit: { subreddits: ['  '], minItems: 1, maxItems: 1, ttlMinutes: 1, minCutoffScore: 0 },
      }).ok,
    ).toBe(false)
  })
  test('rejects minItems > maxItems', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          minItems: 5,
          maxItems: 3,
          ttlMinutes: 30,
          displayRatio: 0.1,
          elbowDropRatio: 0.4,
          minCutoffScore: 0,
        },
      }).ok,
    ).toBe(false)
  })
  test('rejects out-of-range ratio', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          minItems: 1,
          maxItems: 1,
          ttlMinutes: 30,
          displayRatio: 1.5,
          elbowDropRatio: 0.4,
          minCutoffScore: 0,
        },
      }).ok,
    ).toBe(false)
  })
  test('rejects negative ttl', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          minItems: 1,
          maxItems: 1,
          ttlMinutes: 0,
          displayRatio: 0.1,
          elbowDropRatio: 0.4,
          minCutoffScore: 0,
        },
      }).ok,
    ).toBe(false)
  })
  test('rejects negative minCutoffScore', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          minItems: 1,
          maxItems: 1,
          ttlMinutes: 30,
          displayRatio: 0.1,
          elbowDropRatio: 0.4,
          minCutoffScore: -1,
        },
      }).ok,
    ).toBe(false)
  })
})
