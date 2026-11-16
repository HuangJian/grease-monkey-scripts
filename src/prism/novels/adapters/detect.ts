import { htmlToDocument } from '../../../utils'
import { suduguAdapter } from './sudugu'
import type { NovelAdapter } from './types'

/**
 * Pick a parser from the page's DOM, never from its hostname.
 *
 * Novel sites rotate domains constantly (sudugu.org → sudugu520.com, shudugu,
 * deqixs, …). A hostname registry would need an update for every move and would
 * reject an otherwise perfectly parseable page until that update shipped.
 * Structure is the contract: if the page exposes the template's catalog block
 * we can read it, whatever domain serves it.
 *
 * The `#dir` anchor guards the catalog-less variant: the site home page uses
 * the same `.itemtxt` + three-link layout, but its h1 points at a single book
 * (`/14/`) instead of the book's own directory (`/1210/#dir`). Without this
 * guard a homepage would be mistaken for a three-chapter book.
 */
export function detectAdapter(html: string, domParser: DOMParser): NovelAdapter | undefined {
  if (!html) return undefined
  const doc = htmlToDocument(html, domParser)
  const itemTxt = doc.querySelector('.itemtxt')
  if (!itemTxt) return undefined
  const hasCatalog = doc.querySelector('#list') !== null
  const hasBookDir = itemTxt.querySelector('h1 a[href*="#dir"]') !== null
  return hasCatalog || hasBookDir ? suduguAdapter : undefined
}
