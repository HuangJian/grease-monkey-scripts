import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchTnews } from '../../../../src/prism/tnews/fetcher'
import { TNEWS_FEED_URL } from '../../../../src/prism/tnews/constants'
import type { RequestDetails } from '../../../../src/runtime'
import { createRuntime, XmlDOMParser, type TestRuntime } from '../../../runtime'

function loadFixture(): string {
  return readFileSync(join(import.meta.dir, '..', '..', 'fixtures', 'tnews-sample.xml'), 'utf8')
}

function makeRuntime(handler: (d: RequestDetails) => void): TestRuntime {
  const base = createRuntime()
  base.DOMParser = XmlDOMParser
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

describe('fetchTnews', () => {
  test('returns items from the hardcoded feed URL', async () => {
    const fixture = loadFixture()
    const fetched: string[] = []
    const runtime = makeRuntime((d) => {
      fetched.push(d.url)
      d.onload({ responseText: fixture, status: 200, responseHeaders: '' })
    })
    const result = await fetchTnews(runtime)
    expect(fetched).toEqual([TNEWS_FEED_URL])
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.errors).toEqual([])
  })

  test('throws when feed fails with network error', async () => {
    const runtime = makeRuntime((d) => {
      d.onerror?.()
    })
    await expect(fetchTnews(runtime)).rejects.toThrow(/all feeds failed/)
  })

  test('rejects feed URL with non-2xx status', async () => {
    const runtime = makeRuntime((d) => {
      d.onload({ responseText: 'bad', status: 503, responseHeaders: '' })
    })
    await expect(fetchTnews(runtime)).rejects.toThrow()
  })
})
