/** GM storage key for v2ex author tag data */
export const V2EX_AUTHOR_TAGS_KEY = 'v2ex_author_tags'
/** localStorage key shared across scripts for v2ex author tag data */
export const V2EX_AUTHOR_TAGS_LS_KEY = 'gm:v2ex:author-tags'
/** GM storage key for reddit author tag data */
export const REDDIT_AUTHOR_TAGS_KEY = 'reddit_author_tags'
/** localStorage key shared across scripts for reddit author tag data */
export const REDDIT_AUTHOR_TAGS_LS_KEY = 'gm:reddit:author-tags'
/** GM storage key for hupu author tag data */
export const HUPU_AUTHOR_TAGS_KEY = 'hupu_author_tags'
/** localStorage key shared across scripts for hupu author tag data */
export const HUPU_AUTHOR_TAGS_LS_KEY = 'gm:hupu:author-tags'

export type TagRecord = {
  url: string
  score: number
}

export type AuthorTags = Record<string, TagRecord>

export type AuthorTagMap = Record<string, AuthorTags>

export function toRelativeUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname.replace(/^\//, '') + u.hash
  } catch {
    return url
  }
}

export function getTotalScore(tags: AuthorTags | undefined): number {
  if (!tags) return 0
  return Object.values(tags).reduce((sum, t) => sum + (t.score || 0), 0)
}

export function getAuthorTags(map: AuthorTagMap, id: string): AuthorTags | undefined {
  return map[id]
}

export function addTag(
  map: AuthorTagMap,
  id: string,
  tag: string,
  url: string,
  score: number,
): void {
  const trimmed = tag.trim()
  if (!trimmed) return
  if (!map[id]) map[id] = {}
  map[id][trimmed] = { url, score }
}

export function removeTag(map: AuthorTagMap, id: string, tag: string): void {
  if (!map[id]) return
  delete map[id][tag]
  if (Object.keys(map[id]).length === 0) {
    delete map[id]
  }
}

export function incrementTagScore(
  map: AuthorTagMap,
  id: string,
  tag: string,
  url: string,
  delta: number,
): void {
  if (!map[id]) map[id] = {}
  const existing = map[id][tag]
  if (existing) {
    existing.score += delta
  } else {
    map[id][tag] = { url, score: delta }
  }
}

function isValidTagRecord(v: unknown): v is TagRecord {
  return (
    v != null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof (v as TagRecord).url === 'string' &&
    typeof (v as TagRecord).score === 'number'
  )
}

function isValidAuthorTags(v: unknown): v is AuthorTags {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return false
  return Object.values(v).every((tag) => isValidTagRecord(tag))
}

export function tagColor(score: number): string {
  if (score > 0) return 'darkgreen'
  if (score < 0) return 'red'
  return 'gray'
}

/** Returns the CSS class string for an author's total score */
export function authorClass(totalScore: number): string {
  return totalScore > 0 ? ' gm-sp-author-pos' : totalScore < 0 ? ' gm-sp-author-neg' : ''
}

/** Returns CSS class for an individual tag record's score */
export function tagClass(score: number): string {
  return score > 0 ? ' gm-sp-author-pos' : score < 0 ? ' gm-sp-author-neg' : ''
}

/** Builds the HTML for #tag spans appended to a title, given an author's tags */
export function buildAuthorTagHtml(
  tags: AuthorTags | undefined,
  escapeFn: (s: string) => string,
): string {
  if (!tags) return ''
  const entries = Object.entries(tags)
  if (entries.length === 0) return ''
  return (
    ' ' +
    entries
      .map(([name, rec]) => {
        const cls = tagClass(rec.score)
        return `<span class="gm-sp-author-tag${cls}">#${escapeFn(name)}</span>`
      })
      .join(' ')
  )
}

export function parseAuthorTagMap(value: unknown): AuthorTagMap {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const result: AuthorTagMap = {}
  for (const [id, tags] of Object.entries(value)) {
    if (typeof id === 'string' && isValidAuthorTags(tags)) {
      result[id] = tags as AuthorTags
    }
  }
  return result
}
