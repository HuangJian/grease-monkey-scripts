import type { Runtime } from '../runtime'

export type V2exApp = {
  addTargetToTopicLinks: (runtime: Runtime) => void
  embedDiscussions: (runtime: Runtime) => void
  getCommentElementsFromHtmlString: (html: string) => NodeListOf<Element>
  highlightCommentsAndTopics: () => void
  tagAuthor: (id: string, commentNumber: number | string, tag: string, delta: number) => void
  setTag: (id: string, tag: string, score: number, commentNumber: number | string) => void
  unsetTag: (id: string, tag: string) => void
  getTags: (id: string) => Record<string, { url: string; score: number }> | undefined
  getScore: (id: string) => number
  getAuthorTagMap: () => Record<string, Record<string, { url: string; score: number }>>
  reorderCommentsByHearts: (runtime: Runtime) => void
  start: () => void
}
