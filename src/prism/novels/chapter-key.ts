/**
 * Cross-site chapter identity.
 *
 * A chapter is identified across mirror sites by its chapter number when one
 * can be derived from the title (e.g. "第123章", "第一百一十八章", "第１２０章"),
 * and otherwise falls back to a normalized title. The resulting key is stored
 * on every NovelChapter so that "seen" state and merges are site-independent.
 */

const CHAPTER_UNITS = '章节節回话話'
const NUMERIC_RE = new RegExp(
  `第\\s*([0-9０-９]+|[一二三四五六七八九十百千两零〇]+)\\s*[${CHAPTER_UNITS}]`,
)
const LEADING_NUMERIC_RE = /^(\d+)\s*[.\-_、:：\s]/

/** Full-width digits → half-width, so Number() can parse them. */
function toAsciiDigits(s: string): string {
  return s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
}

const CJK_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  百: 100,
  千: 1000,
}

/**
 * Parse a run of CJK numerals such as "一", "二十三", "一百零五", "一千二百三十四".
 * Supports 0–9999 (and trivially beyond via 千); returns undefined for anything
 * containing 万/亿 or non-numeral characters (so "三万" and "abc" both fail).
 */
export function parseChineseNumeral(s: string): number | undefined {
  if (!s) return undefined
  let total = 0
  let section = 0
  let hasDigit = false
  for (const ch of s) {
    const v = CJK_DIGITS[ch]
    if (v === undefined) return undefined
    if (v === 0) continue
    hasDigit = true
    if (v >= 10) {
      section = section === 0 ? 1 : section
      section *= v
      total += section
      section = 0
    } else {
      section += v
    }
  }
  return hasDigit ? total + section : undefined
}

/** Extract a chapter number from a title, or undefined when none is present. */
export function chapterNumber(title: string): number | undefined {
  const numMatch = NUMERIC_RE.exec(title)
  if (numMatch) {
    const raw = numMatch[1]!
    if (/[一二三四五六七八九十百千两零〇]/.test(raw)) {
      return parseChineseNumeral(raw)
    }
    return Number(toAsciiDigits(raw))
  }
  const lead = LEADING_NUMERIC_RE.exec(title)
  if (lead) return Number(lead[1])
  return undefined
}

/**
 * Collapse a title to a stable, site-independent token: fold full-width
 * characters, lowercase, and drop everything that is not a letter or digit.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
}

/** Cross-site identity for a chapter: `n:<number>` or `t:<normalized title>`. */
export function chapterKey(title: string): string {
  const num = chapterNumber(title)
  if (num !== undefined) return `n:${num}`
  return `t:${normalizeTitle(title)}`
}
