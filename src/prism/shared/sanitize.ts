export type SanitizeOptions = {
  /**
   * Wrap free-floating `<img>` elements in an `<a target="_blank">` so images
   * open safely in a new tab instead of navigating the host page. tnews keeps
   * this on; features with their own image handling (e.g. xueqiu lightbox)
   * turn it off.
   */
  wrapImagesInAnchor?: boolean
}

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'a',
  'b',
  'i',
  'em',
  'strong',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'span',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'figure',
  'figcaption',
  'img',
])

const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'link',
  'meta',
  'form',
  'input',
  'button',
  'base',
  'frame',
  'frameset',
  'noscript',
  'template',
  'slot',
  'video',
  'audio',
  'source',
  'track',
])

const DANGEROUS_HREF_PREFIXES = /^\s*(javascript|data|vbscript):/i

/**
 * Pure-DOM whitelist sanitizer. Entities are decoded by the HTML parser before
 * attribute inspection, so `&#106;avascript:` hrefs are caught — unlike string
 * blacklists. Never concatenate/parse the result with regexes afterward.
 */
export function sanitizeHtml(
  html: string,
  domParser: DOMParser,
  options: SanitizeOptions = {},
): string {
  if (!html) return ''
  const doc = domParser.parseFromString(`<div id="__gm_sanitize_root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__gm_sanitize_root')
  if (!root) return ''
  sanitizeNode(root, options.wrapImagesInAnchor ?? false)
  return root.innerHTML
}

function sanitizeNode(node: Element, wrapImagesInAnchor: boolean): void {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === 1) {
      sanitizeNode(child as Element, wrapImagesInAnchor)
    }
  })
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType !== 1) return
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (BLOCKED_TAGS.has(tag)) {
      node.removeChild(el)
      return
    }
    if (!ALLOWED_TAGS.has(tag)) {
      const parent = el.parentNode
      if (!parent) return
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el)
      }
      parent.removeChild(el)
      return
    }
    sanitizeAttrs(el, tag)
    if (
      wrapImagesInAnchor &&
      tag === 'img' &&
      el.hasAttribute('src') &&
      el.parentNode &&
      (el.parentNode as Element).tagName?.toLowerCase() !== 'a'
    ) {
      const src = el.getAttribute('src')!
      const anchor = el.ownerDocument!.createElement('a')
      anchor.setAttribute('href', src)
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noopener noreferrer')
      el.parentNode.replaceChild(anchor, el)
      anchor.appendChild(el)
    }
  })
}

function sanitizeAttrs(el: Element, tag: string): void {
  Array.from(el.attributes).forEach((attr) => {
    const name = attr.name.toLowerCase()
    if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
      el.removeAttribute(attr.name)
      return
    }
    if (tag === 'a' && name === 'href') {
      if (DANGEROUS_HREF_PREFIXES.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
    if (tag === 'img') {
      if (name === 'width' || name === 'height') {
        el.removeAttribute(attr.name)
        return
      }
      if (name === 'src' && DANGEROUS_HREF_PREFIXES.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
  })
  if (tag === 'a' && el.hasAttribute('href')) {
    el.setAttribute('target', '_blank')
    el.setAttribute('rel', 'noopener noreferrer')
  }
}
