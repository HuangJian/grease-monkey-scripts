import type { Runtime } from '../../runtime'
import { BACKOFF_DELAYS_MS } from '../types'

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

export type RetryOptions = {
  /** HTTP statuses that should trigger a retry (e.g. [429]). */
  statuses: number[]
  /** Maximum number of additional attempts (beyond the first) on a retryable status. */
  max: number
  /** Fixed backoff in ms; falls back to BACKOFF_DELAYS_MS when omitted and no Retry-After header. */
  baseDelayMs?: number
}

export type RequestOptions = {
  timeout?: number
  headers?: Record<string, string>
  anonymous?: boolean
  retry?: RetryOptions
}

export type TextResponse = {
  text: string
  headers: string
  status: number
}

/**
 * Parse a `Retry-After` header (delta-seconds variant) into milliseconds.
 * Returns 0 when absent/invalid so callers fall back to a fixed backoff.
 */
function parseRetryAfterMs(header: string): number {
  if (!header) return 0
  const match = header.match(/retry-after:\s*(\d+)/i)
  if (!match) return 0
  const secs = Number(match[1])
  return Number.isFinite(secs) && secs > 0 ? secs * 1000 : 0
}

/**
 * Backoff delay for retry attempt `attempt` (0-based).
 * Preference: explicit `Retry-After` header → `baseDelayMs` → `BACKOFF_DELAYS_MS[attempt]`.
 */
export function computeRetryDelayMs(
  attempt: number,
  retryAfterHeader: string,
  baseDelayMs?: number,
): number {
  const fromHeader = parseRetryAfterMs(retryAfterHeader)
  if (fromHeader > 0) return fromHeader
  if (baseDelayMs && baseDelayMs > 0) return baseDelayMs
  const idx = Math.min(attempt, BACKOFF_DELAYS_MS.length - 1)
  return BACKOFF_DELAYS_MS[idx] ?? BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1]!
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
  const retry = options.retry
  return new Promise((resolve, reject) => {
    const attempt = (n: number): void => {
      runtime.request({
        url,
        method: 'GET',
        timeout: options.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS,
        headers: options.headers,
        anonymous: options.anonymous,
        onload(response) {
          // Retryable status: schedule another attempt (up to `retry.max` retries).
          if (
            response.status >= 400 &&
            retry &&
            retry.statuses.includes(response.status) &&
            n < retry.max
          ) {
            const delay = computeRetryDelayMs(n, response.responseHeaders, retry.baseDelayMs)
            runtime.setTimeout(() => attempt(n + 1), delay)
            return
          }
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
    }
    attempt(0)
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
