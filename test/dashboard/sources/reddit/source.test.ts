import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, within } from '@testing-library/preact'
import { h } from 'preact'
import { validateConfig } from '../../../../src/dashboard/config'
import { createRedditSource } from '../../../../src/dashboard/reddit/source'
import { STATE_KEY } from '../../../../src/dashboard/types'
import type { RedditPost, RedditSourceOptions } from '../../../../src/dashboard/reddit/types'
import type { RequestDetails } from '../../../../src/runtime'
import { createRuntime, type TestRuntime } from '../../../runtime'

const DEFAULT_COUNT_OPTS = {
  minItems: 10,
  minPerSub: 1,
  displayRatio: 0.1,
  elbowDropRatio: 0.4,
  minCutoffScore: 500,
  ageHalfLifeDays: 2,
}

function defaultRedditOpts(over: Partial<RedditSourceOptions> = {}): RedditSourceOptions {
  return {
    ttlMinutes: 30,
    subreddits: ['popular'],
    ...DEFAULT_COUNT_OPTS,
    ...over,
  }
}

function loadFixture(): unknown {
  const text = readFileSync(
    join(import.meta.dir, '..', '..', 'fixtures', 'reddit-popular.json'),
    'utf8',
  )
  return JSON.parse(text)
}

function makeRuntime(handler: (d: RequestDetails) => void): TestRuntime {
  const base = createRuntime()
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

describe('createRedditSource', () => {
  test('source metadata is correct', () => {
    const source = createRedditSource(defaultRedditOpts())
    expect(source.id).toBe('reddit')
    expect(source.title).toBe('Reddit 热帖')
    expect(source.groupId).toBe('browse')
    expect(source.order).toBe(3)
    expect(source.ttlMs).toBe(30 * 60_000)
    expect(typeof source.createEditor).toBe('function')
  })
})

describe('createRedditSource.fetch reads fresh config', () => {
  test('fetch uses subreddits from CONFIG_KEY, not stale closure options', async () => {
    const json = loadFixture()
    const fetchedUrls: string[] = []
    const runtime = makeRuntime((d) => {
      fetchedUrls.push(d.url)
      d.onload({ responseText: JSON.stringify(json) })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['popular'] }))
    runtime.stores['dashboard:v1:config'] = {
      reddit: { subreddits: ['funny'] },
    }
    const data = await source.fetch(runtime, undefined)
    expect(fetchedUrls.every((u) => u.includes('/r/funny/'))).toBe(true)
    expect(fetchedUrls.some((u) => u.includes('/r/popular/'))).toBe(false)
    expect(typeof data).toBe('object')
    expect(data).not.toBeInstanceOf(Array)
  })

  test('fetch falls back to closure options when CONFIG_KEY has no reddit config', async () => {
    const json = loadFixture()
    const fetchedUrls: string[] = []
    const runtime = makeRuntime((d) => {
      fetchedUrls.push(d.url)
      d.onload({ responseText: JSON.stringify(json) })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['popular'] }))
    await source.fetch(runtime, undefined)
    expect(fetchedUrls.every((u) => u.includes('/r/popular/'))).toBe(true)
  })

  test('fetch returns a Map keyed by sub', async () => {
    const json = loadFixture()
    const runtime = makeRuntime((d) => {
      d.onload({ responseText: JSON.stringify(json) })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['funny', 'aww'] }))
    const data = await source.fetch(runtime, undefined)
    expect(data).not.toBeNull()
    expect(typeof data).toBe('object')
    expect(
      (data as Record<string, unknown>)['funny'] || (data as Record<string, unknown>)['aww'],
    ).toBeTruthy()
  })
})

describe('createRedditSource.render uses ctx.runtime when runtimeRef is null', () => {
  test('bugfix: clicking title persists read state even if fetch() was never called', () => {
    const runtime = createRuntime()
    const source = createRedditSource(defaultRedditOpts())

    const container = document.createElement('div')
    document.body.appendChild(container)
    const data: Record<string, RedditPost[]> = {
      aww: [
        {
          id: 'a1',
          title: 'test post',
          url: 'https://www.reddit.com/r/aww/comments/a1/t',
          score: 100,
          numComments: 5,
          subreddits: ['aww'],
          author: 'u',
          created: Date.now(),
        },
      ],
    }

    // Simulate mount flow: render before any fetch() call
    render(h(source.RenderComponent!, { data, root: undefined, runtime }), { container })

    const link = within(container).getByRole('link', { name: 'test post' }) as HTMLAnchorElement
    link.click()

    // The mark should be saved to storage via ctx.runtime
    const stored = runtime.stores[STATE_KEY('reddit')] as Record<string, { r?: number }> | undefined
    expect(stored?.['a1']?.r).toBeGreaterThan(0)
  })
})

describe('validateConfig.reddit', () => {
  test('accepts default config', () => {
    expect(
      validateConfig({
        reddit: {
          ttlMinutes: 30,
          ageHalfLifeDays: 2,
          subreddits: ['popular'],
          minItems: 10,
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
        reddit: { subreddits: [], minItems: 1, ttlMinutes: 1, minCutoffScore: 0 },
      }).ok,
    ).toBe(false)
  })
  test('rejects blank subreddit name', () => {
    expect(
      validateConfig({
        reddit: { subreddits: ['  '], minItems: 1, ttlMinutes: 1, minCutoffScore: 0 },
      }).ok,
    ).toBe(false)
  })
  test('rejects out-of-range ratio', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          minItems: 1,
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
          ttlMinutes: 30,
          displayRatio: 0.1,
          elbowDropRatio: 0.4,
          minCutoffScore: -1,
        },
      }).ok,
    ).toBe(false)
  })
  test('rejects ageHalfLifeDays out of range', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          minItems: 1,
          ttlMinutes: 30,
          displayRatio: 0.1,
          elbowDropRatio: 0.4,
          minCutoffScore: 0,
          ageHalfLifeDays: 0,
        },
      }).ok,
    ).toBe(false)
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          minItems: 1,
          ttlMinutes: 30,
          displayRatio: 0.1,
          elbowDropRatio: 0.4,
          minCutoffScore: 0,
          ageHalfLifeDays: 31,
        },
      }).ok,
    ).toBe(false)
  })
})
