import type { Runtime } from '../../runtime'

export type WeatherRequestOptions = {
  timeout?: number
  headers?: Record<string, string>
  anonymous?: boolean
}

export function requestJson(
  runtime: Runtime,
  url: string,
  options: WeatherRequestOptions = {},
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    runtime.request({
      url,
      method: 'GET',
      timeout: options.timeout ?? 15000,
      headers: options.headers,
      anonymous: options.anonymous,
      onload(response) {
        try {
          resolve(JSON.parse(response.responseText) as unknown)
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      },
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    })
  })
}

export function requestText(
  runtime: Runtime,
  url: string,
  options: WeatherRequestOptions = {},
): Promise<string> {
  return requestTextWithHeaders(runtime, url, options).then((r) => r.text)
}

/**
 * Like `requestText` but also returns the raw response headers string.
 * Needed for WAF challenge solving (extracting Set-Cookie values).
 */
export function requestTextWithHeaders(
  runtime: Runtime,
  url: string,
  options: WeatherRequestOptions = {},
): Promise<{ text: string; headers: string }> {
  return new Promise((resolve, reject) => {
    runtime.request({
      url,
      method: 'GET',
      timeout: options.timeout ?? 15000,
      headers: options.headers,
      anonymous: options.anonymous,
      onload(response) {
        resolve({ text: response.responseText, headers: response.responseHeaders })
      },
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    })
  })
}
