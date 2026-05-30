export type AuthorRecord = {
  url: string
  label?: string
}

export type AuthorValue = string | AuthorRecord

export type AuthorMap = Map<string, AuthorValue>

export const defaultLabels = {
  shame: '若婴',
  thank: '智者',
} as const

export function getAuthorRecord(map: AuthorMap, id: string): AuthorRecord | null {
  const value = map.get(id)
  if (!value) {
    return null
  }
  if (typeof value === 'string') {
    return { url: value }
  }
  return value
}

export function getAuthorLabel(map: AuthorMap, id: string, fallbackLabel: string): string {
  return getAuthorRecord(map, id)?.label || fallbackLabel
}
