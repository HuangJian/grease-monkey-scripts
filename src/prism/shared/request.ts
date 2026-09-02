import type { Runtime } from '../../runtime'

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

export type RequestOptions = {
  timeout?: number
  headers?: Record<string, string>
  anonymous?: boolean
}

export type TextResponse = {
  text: string
  headers: string
  status: number
}

/**
 * GET a URL as text, also returning the raw response headers.
 *
 * Rejects on network error, timeout, or HTTP status >= 400 — an error page
 * must never reach a parser, which would silently yield empty results.
 * The raw headers are needed by callers that solve WAF challenges (Set-Cookie).
 */
export function requestTextWithHeaders(
  runtime: Runtime,
  url: string,
  options: RequestOptions = {},
): Promise<TextResponse> {
  return new Promise((resolve, reject) => {
    runtime.request({
      url,
      method: 'GET',
      timeout: options.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS,
      headers: options.headers,
      anonymous: options.anonymous,
      onload(response) {
        if (response.status >= 400) {
          reject(new Error(`http ${response.status}`))
          return
        }
        resolve({
          text: response.responseText,
          headers: response.responseHeaders,
          status: response.status,
        })
      },
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    })
  })
}

/** GET a URL as text. Rejects on network error, timeout, or status >= 400. */
export function requestText(
  runtime: Runtime,
  url: string,
  options: RequestOptions = {},
): Promise<string> {
  return requestTextWithHeaders(runtime, url, options).then((r) => r.text)
}

/** GET a URL and parse the body as JSON. Rejects on invalid JSON. */
export function requestJson(
  runtime: Runtime,
  url: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return requestText(runtime, url, options).then((text) => JSON.parse(text) as unknown)
}
