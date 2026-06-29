import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeSubredditName, parseRedditListing } from '../../../../src/prism/reddit/parser'

function loadFixture(): unknown {
  const text = readFileSync(
    join(import.meta.dir, '..', '..', 'fixtures', 'reddit-popular.json'),
    'utf8',
  )
  return JSON.parse(text)
}

describe('normalizeSubredditName', () => {
  test('strips r/ prefix and lowercases', () => {
    expect(normalizeSubredditName('r/Funny')).toBe('funny')
  })
  test('strips leading slash', () => {
    expect(normalizeSubredditName('/funny')).toBe('funny')
  })
  test('strips /r/ prefix', () => {
    expect(normalizeSubredditName('/r/funny')).toBe('funny')
  })
  test('trims whitespace', () => {
    expect(normalizeSubredditName('  funny  ')).toBe('funny')
  })
  test('removes invalid characters', () => {
    expect(normalizeSubredditName('awe some!')).toBe('awesome')
  })
  test('returns empty for blank or invalid input', () => {
    expect(normalizeSubredditName('   ')).toBe('')
    expect(normalizeSubredditName('!!!')).toBe('')
  })
})

describe('parseRedditListing', () => {
  test('parses valid listing', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    const ids = posts.map((p) => p.id)
    expect(ids).toContain('pop001')
    expect(ids).toContain('pop002')
  })
  test('builds absolute permalink url', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    const post = posts.find((p) => p.id === 'pop001')!
    expect(post.url).toBe(
      'https://www.reddit.com/r/aww/comments/pop001/cat_photobombs_every_family_photo/',
    )
  })
  test('skips non-t3 children (t1 comments)', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    expect(posts.find((p) => p.id === 'comment001')).toBeUndefined()
  })
  test('drops over_18 posts', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    expect(posts.find((p) => p.id === 'pop004')).toBeUndefined()
  })
  test('drops distinguished=promoted posts', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    expect(posts.find((p) => p.id === 'pop006')).toBeUndefined()
  })
  test('drops posts with empty title', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    expect(posts.find((p) => p.id === 'pop005')).toBeUndefined()
  })
  test('returns empty for non-listing input', () => {
    expect(parseRedditListing(null, 10)).toEqual([])
    expect(parseRedditListing({}, 10)).toEqual([])
    expect(parseRedditListing({ data: {} }, 10)).toEqual([])
    expect(parseRedditListing({ data: { children: 'x' } }, 10)).toEqual([])
  })
  test('respects maxItems', () => {
    const json = loadFixture()
    expect(parseRedditListing(json, 2)).toHaveLength(2)
  })
  test('normalizes subreddit names', () => {
    const json = {
      data: {
        children: [
          {
            kind: 't3',
            data: {
              id: 'x',
              title: 't',
              permalink: '/r/X/comments/x/',
              score: 10,
              num_comments: 1,
              subreddit: 'r/Sub',
              created_utc: 1700000000,
            },
          },
        ],
      },
    }
    const [post] = parseRedditListing(json, 10)
    expect(post.id).toBe('x')
  })
  test('parses created_utc to milliseconds', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    const post = posts.find((p) => p.id === 'pop001')!
    expect(post.created).toBe(1_700_000_000_000)
  })
  test('falls back to current time when created_utc is missing or invalid', () => {
    const before = Date.now()
    const json = {
      data: {
        children: [
          {
            kind: 't3',
            data: {
              id: 'a',
              title: 'no-time',
              permalink: '/r/x/comments/a/',
              score: 10,
              num_comments: 1,
              subreddit: 'x',
            },
          },
          {
            kind: 't3',
            data: {
              id: 'b',
              title: 'bad-time',
              permalink: '/r/x/comments/b/',
              score: 10,
              num_comments: 1,
              subreddit: 'x',
              created_utc: -1,
            },
          },
        ],
      },
    }
    const after = Date.now()
    const posts = parseRedditListing(json, 10)
    expect(posts).toHaveLength(2)
    for (const p of posts) {
      expect(p.created).toBeGreaterThanOrEqual(before)
      expect(p.created).toBeLessThanOrEqual(after)
    }
  })
})
