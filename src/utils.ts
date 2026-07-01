export function htmlToDocument(html: string, domParser: DOMParser): Document {
  return domParser.parseFromString(html, 'text/html')
}

export function getLinkText(link: Element | null): string {
  return (link?.textContent || '').replace(/\s+/g, '')
}

export function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function escapeUrl(s: string): string {
  return isAbsoluteUrl(s) ? s : ''
}

export function toAbsoluteUrl(url: string | null, base: string): string {
  if (!url) return ''
  return isAbsoluteUrl(url) ? url : new URL(url, base).href
}

export function matchesText(matcher: RegExp | ((text: string) => boolean), text: string): boolean {
  return matcher instanceof RegExp ? matcher.test(text) : matcher(text)
}

export function numberOrDefault(val: unknown, defaultVal: number): number {
  return typeof val === 'number' ? val : defaultVal
}
