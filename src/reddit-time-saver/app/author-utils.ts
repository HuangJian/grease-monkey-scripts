import type { Runtime } from '../../runtime'

export function getAuthorName(authorLink: Element): string {
  const href = authorLink.getAttribute('href') || ''
  const match = href.match(/\/user\/([^/]+)/i)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1])
  } catch {
    return ''
  }
}

export function getCommentId(authorLink: Element): string {
  const comment = authorLink.closest('[id*="t1_"], .thing[id]')
  return comment?.id || ''
}

export function buildAnchorUrl(runtime: Runtime, commentId: string): string {
  const path = runtime.location.pathname.replace(/\/$/, '')
  return `${path}/${commentId}/`
}

export function isAuthorHeader(link: Element): boolean {
  const text = (link.textContent || '').trim()
  if (!text) return false
  if (text.startsWith('u/') || text.startsWith('/u/')) return false
  return true
}

export function findAuthorLinks(root: Node): Element[] {
  const links: Element[] = []

  function walk(node: Node): void {
    if (node.nodeType !== 1) return
    const el = node as Element
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || ''
      if (href.toLowerCase().includes('/user/')) {
        links.push(el)
      }
    }
    const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
    if (shadow) {
      walk(shadow)
    }
    let child = el.firstChild
    while (child) {
      walk(child)
      child = child.nextSibling
    }
  }

  walk(root)
  return links
}
