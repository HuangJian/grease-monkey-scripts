import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import { applyHighlights } from './highlight'
import { processElement } from './tag-buttons'

export function setupObserver(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  tagAuthor: (username: string, commentId: string, tag: string, delta: number) => void,
  setTag: (username: string, tag: string, score: number, commentId: string) => void,
  unsetTag: (username: string, tag: string) => void,
): () => void {
  let disconnected = false
  const observer = new runtime.MutationObserver((mutations) => {
    if (disconnected) return
    let found = false
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue
        processElement(runtime, authorTagMap, tagAuthor, setTag, unsetTag, node)
        found = true
      }
    }
    if (found) applyHighlights(runtime, authorTagMap)
  })
  observer.observe(runtime.document.body, { childList: true, subtree: true })

  return () => {
    disconnected = true
    observer.disconnect()
  }
}
