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
