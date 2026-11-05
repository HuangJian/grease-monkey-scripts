export const DEFAULT_V2EX_HOST = 'www.v2ex.com'
export const HOT_API_PATH = '/api/topics/hot.json'
export const HOT_PAGE_PATH = '/?tab=hot'

export const HOT_API_BASE = `https://${DEFAULT_V2EX_HOST}${HOT_API_PATH}`
export const HOT_PAGE_URL = `https://${DEFAULT_V2EX_HOST}${HOT_PAGE_PATH}`

/**
 * Only the two main hosts serve the hot endpoints same-origin (the site sends
 * no CORS headers); other *.v2ex.com subdomains (cdn / staging) do not. Any
 * other page has to fall back to GM_xmlhttpRequest — with cookies, so a
 * Cloudflare clearance the browser already earned is actually sent.
 */
export function isV2exHost(hostname: string): boolean {
  return hostname === 'v2ex.com' || hostname === 'www.v2ex.com'
}

export function hotApiUrl(host: string, cacheBust: number): string {
  return `https://${host}${HOT_API_PATH}?_t=${cacheBust}`
}

export function hotPageUrl(host: string): string {
  return `https://${host}${HOT_PAGE_PATH}`
}

export const TOPIC_PATH_RE = /^\/t\/(\d+)/
export const MEMBER_PATH_RE = /^\/member\/([A-Za-z0-9_-]+)/
