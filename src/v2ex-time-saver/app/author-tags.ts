import type { Runtime } from '../../runtime'
import { V2EX_AUTHOR_TAGS_LS_KEY, type AuthorTagMap } from '../../shared/author-labels'
import { parseAuthorTagMap } from '../../shared/author-labels'

export const authorTagsKeyword = 'author_tags'

export async function loadAuthorTagMap(runtime: Runtime): Promise<AuthorTagMap> {
  const value = await runtime.getValue<unknown>(authorTagsKeyword, {})
  return parseAuthorTagMap(value)
}

export function persistAuthorTags(runtime: Runtime, tagMap: AuthorTagMap): void {
  void runtime.setValue(authorTagsKeyword, tagMap)
  try {
    localStorage.setItem(V2EX_AUTHOR_TAGS_LS_KEY, JSON.stringify(tagMap))
  } catch {
    /* localStorage may be unavailable */
  }
}
