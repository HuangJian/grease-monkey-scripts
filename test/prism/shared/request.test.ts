import { describe, expect, test } from 'bun:test'
import { createRuntime } from '../../runtime'
import {
  headerValue,
  requestJson,
  requestText,
  requestTextWithHeaders,
} from '../../../src/prism/shared/request'

describe('headerValue', () => {
  const RAW = 'Date: Wed, 21 Oct 2015 07:28:00 GMT\r\nETag: W/"abc123"\r\nContent-Type: text/xml'

  test('reads a header case-insensitively', () => {
    expect(headerValue(RAW, 'etag')).toBe('W/"abc123"')
    expect(headerValue(RAW, 'ETAG')).toBe('W/"abc123"')
    expect(headerValue(RAW, 'Etag')).toBe('W/"abc123"')
  })

  test('keeps the value verbatim so it can be echoed back', () => {
    // A normalised ETag (quotes or W/ stripped, case folded) is refused by the
    // server, which would turn every conditional request into a full download.
    expect(headerValue(RAW, 'etag')).toBe('W/"abc123"')
    expect(headerValue('Last-Modified: Wed, 21 Oct 2015 07:28:00 GMT', 'last-modified')).toBe(
      'Wed, 21 Oct 2015 07:28:00 GMT',
    )
  })

  test('handles LF-only and empty-header input', () => {
    expect(headerValue('ETag: "x"\nX-Other: y', 'etag')).toBe('"x"')
    expect(headerValue('', 'etag')).toBe('')
    expect(headerValue('ETag:', 'etag')).toBe('')
    expect(headerValue(RAW, 'x-missing')).toBe('')
  })

  test('does not match on a substring of the name', () => {
    expect(headerValue(RAW, 'tag')).toBe('')
    expect(headerValue(RAW, 'content')).toBe('')
  })
})

describe('shared/request', () => {
  test('requestText resolves body on 200', async () => {
    const runtime = createRuntime()
    runtime.queueResponse('https://x.test/a', '<p>ok</p>')
    expect(await requestText(runtime, 'https://x.test/a')).toBe('<p>ok</p>')
  })

  test('bugfix: requestText rejects on HTTP status >= 400 so error pages never reach a parser', async () => {
    const runtime = createRuntime()
    // An error page (e.g. 404/403) used to be returned as "text" and silently
    // parsed into empty results. Now it must reject.
    runtime.queueResponse('https://x.test/missing', '<html>404 Not Found</html>', 404)
    await expect(requestText(runtime, 'https://x.test/missing')).rejects.toThrow('http 404')
  })

  test('requestText rejects on network error', async () => {
    const runtime = createRuntime()
    // No queued response -> runtime.request calls onerror().
    await expect(requestText(runtime, 'https://x.test/down')).rejects.toThrow('network error')
  })

  test('requestText rejects on timeout', async () => {
    const runtime = createRuntime()
    const custom = Object.assign(runtime, {
      request: (details: { ontimeout?: () => void }) => details.ontimeout?.(),
    })
    await expect(requestText(custom, 'https://x.test/slow')).rejects.toThrow('timeout')
  })

  test('requestTextWithHeaders also returns raw response headers', async () => {
    const runtime = createRuntime()
    runtime.queueResponse('https://x.test/h', 'body', 200, 'set-cookie: a=1')
    const res = await requestTextWithHeaders(runtime, 'https://x.test/h')
    expect(res.text).toBe('body')
    expect(res.headers).toBe('set-cookie: a=1')
    expect(res.status).toBe(200)
  })

  test('requestJson parses the body', async () => {
    const runtime = createRuntime()
    runtime.queueResponse('https://x.test/j', '{"a":1}', 200)
    expect(await requestJson(runtime, 'https://x.test/j')).toEqual({ a: 1 })
  })

  test('requestJson rejects on invalid JSON', async () => {
    const runtime = createRuntime()
    runtime.queueResponse('https://x.test/bad', 'not json', 200)
    await expect(requestJson(runtime, 'https://x.test/bad')).rejects.toThrow()
  })
})
