import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import type { QuickLabels } from '../../shared/tag-panel'
import { applyHighlights } from './highlight'
import { processElement } from './tag-buttons'

export function setupObserver(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  euidToPuidMap: Map<string, string>,
  tagAuthor: (id: string, commentNumber: number | string, tag: string, delta: number) => void,
  setTag: (id: string, tag: string, score: number, commentNumber: number | string) => void,
  unsetTag: (id: string, tag: string) => void,
  quickLabels: QuickLabels,
): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const observer = new runtime.MutationObserver((mutations) => {
    let found = false
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue
        processElement(
          runtime,
          authorTagMap,
          euidToPuidMap,
          tagAuthor,
          setTag,
          unsetTag,
          quickLabels,
          node,
        )
        found = true
      }
    }
    if (found) applyHighlights(runtime, authorTagMap, euidToPuidMap)
  })
  observer.observe(runtime.document.body, { childList: true, subtree: true })

  if (timer === null) {
    timer = setTimeout(function scan() {
      processElement(
        runtime,
        authorTagMap,
        euidToPuidMap,
        tagAuthor,
        setTag,
        unsetTag,
        quickLabels,
        runtime.document.body,
      )
      applyHighlights(runtime, authorTagMap, euidToPuidMap)
      timer = setTimeout(scan, 3000)
    }, 2000)
  }
}
