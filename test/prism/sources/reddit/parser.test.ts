import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalizeSubredditName,
  normalizeSubredditSpec,
  parseRedditFeed,
  splitSubredditSpec,
  specContainsSub,
  subredditSpecLabel,
} from '../../../../src/prism/reddit/parser'

function loadFeedFixture(): string {
  return readFileSync(join(import.meta.dir, '..', '..', 'fixtures', 'reddit-hot.atom'), 'utf8')
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

describe('splitSubredditSpec', () => {
  test('splits a single sub', () => {
    expect(splitSubredditSpec('opencode')).toEqual(['opencode'])
  })
  test('splits a merged group and normalizes each member', () => {
    expect(splitSubredditSpec('r/OpenCode + /r/opencodecli')).toEqual(['opencode', 'opencodecli'])
  })
  test('drops empty and duplicate members', () => {
    expect(splitSubredditSpec('a++b+a+!!')).toEqual(['a', 'b'])
  })
  test('returns empty when nothing is usable', () => {
    expect(splitSubredditSpec('+')).toEqual([])
    expect(splitSubredditSpec('')).toEqual([])
  })
})

describe('normalizeSubredditSpec', () => {
  test('canonical form is order independent', () => {
    expect(normalizeSubredditSpec('opencodecli+opencode')).toBe('opencode+opencodecli')
    expect(normalizeSubredditSpec('opencode+opencodecli')).toBe('opencode+opencodecli')
  })
  test('collapses a single sub to itself', () => {
    expect(normalizeSubredditSpec('/r/Funny')).toBe('funny')
  })
  test('returns empty for junk input', () => {
    expect(normalizeSubredditSpec('!!!')).toBe('')
  })
})

describe('specContainsSub', () => {
  test('matches a single-sub spec', () => {
    expect(specContainsSub('opencode', 'opencode')).toBe(true)
    expect(specContainsSub('opencode', 'opencodecli')).toBe(false)
  })
  test('matches any member of a group', () => {
    expect(specContainsSub('opencode+opencodecli', 'opencodecli')).toBe(true)
    expect(specContainsSub('opencode+opencodecli', 'other')).toBe(false)
  })
  test('is false for a blank post sub', () => {
    expect(specContainsSub('opencode', '  ')).toBe(false)
  })
})

describe('subredditSpecLabel', () => {
  test('renders a single sub', () => {
    expect(subredditSpecLabel('funny')).toBe('r/funny')
  })
  test('renders a group', () => {
    expect(subredditSpecLabel('opencode+opencodecli')).toBe('r/opencode + r/opencodecli')
  })
})

describe('parseRedditFeed', () => {
  const parse = (xml = loadFeedFixture()) => parseRedditFeed(xml, new DOMParser())

  test('tags every entry with the subreddit from its permalink', () => {
    const entries = parse()
    expect(entries.map((e) => e.sub)).toEqual(['programming', 'localllama', 'programming'])
  })

  test('keeps document order — it is Reddit own hot ranking', () => {
    // Fixture dates run 16:31 / 20:00 / 12:00, so a date sort would reorder them.
    expect(parse().map((e) => e.post.id)).toEqual(['1xmxnwu', '1xllama', '1xnodate'])
  })

  test('derives the post id from the permalink, not from the t3_ guid', () => {
    expect(parse()[0]!.post.id).toBe('1xmxnwu')
  })

  test('normalizes the display casing the feed carries', () => {
    // The feed labels this sub `LocalLLaMA`; the section key is normalized.
    expect(parse()[1]!.sub).toBe('localllama')
  })

  test('builds an absolute permalink url', () => {
    expect(parse()[0]!.post.url).toBe(
      'https://www.reddit.com/r/programming/comments/1xmxnwu/can_group_by_still_be_optimized_after_all_these',
    )
  })

  test('strips the /u/ prefix from the Atom author', () => {
    expect(parse()[0]!.post.author).toBe('Giladkl')
  })

  test('marks posts as carrying no metrics', () => {
    for (const { post } of parse()) {
      expect(post.metrics).toBe(false)
      expect(post.score).toBe(0)
      expect(post.numComments).toBe(0)
    }
  })

  test('maps published to milliseconds', () => {
    expect(parse()[0]!.post.created).toBe(Date.parse('2026-11-03T16:31:27+00:00'))
  })

  test('falls back to updated when the feed never published the entry', () => {
    expect(parse()[2]!.post.created).toBe(Date.parse('2026-11-03T12:00:00+00:00'))
  })

  test('falls back to now when the entry carries no date at all', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <link href="https://www.reddit.com/r/x/comments/abc123/t/" />
      <title>undated</title>
    </entry></feed>`
    const before = Date.now()
    const [entry] = parseRedditFeed(xml, new DOMParser())
    expect(entry!.post.created).toBeGreaterThanOrEqual(before)
    expect(entry!.post.created).toBeLessThanOrEqual(Date.now())
  })

  test('skips an entry whose link is not a comments permalink', () => {
    // The promoted slot in the fixture points at the subreddit root.
    expect(parse().find((e) => e.post.id === '1xpromo')).toBeUndefined()
  })

  test('respects maxItems', () => {
    // Capping happens before parsing, so the cap counts feed entries, not posts.
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><link href="https://www.reddit.com/r/x/comments/a1/t/"/><title>a1</title><published>2026-11-03T10:00:00+00:00</published></entry>
      <entry><link href="https://www.reddit.com/r/x/comments/a2/t/"/><title>a2</title><published>2026-11-03T11:00:00+00:00</published></entry>
      <entry><link href="https://www.reddit.com/r/x/comments/a3/t/"/><title>a3</title><published>2026-11-03T12:00:00+00:00</published></entry>
    </feed>`
    expect(parseRedditFeed(xml, new DOMParser(), { maxItems: 2 })).toHaveLength(2)
  })

  test('returns empty for empty or malformed input', () => {
    expect(parseRedditFeed('', new DOMParser())).toEqual([])
    expect(parseRedditFeed('   ', new DOMParser())).toEqual([])
    expect(parseRedditFeed('<feed><entry>', new DOMParser())).toEqual([])
    expect(parseRedditFeed('<html><body>not a feed</body></html>', new DOMParser())).toEqual([])
  })
})
