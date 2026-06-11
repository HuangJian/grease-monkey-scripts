import type { Runtime } from '../../runtime'
import { selectorsFactory } from '../selectors'
import { loadChapter } from './chapter-loader'
import { mergeCurrentChapterIfNeeded } from './merge-current-page'
import { createPreloadController } from './preload-controller'

export { findChapterLink, selectorsFactory } from '../selectors'

export function startArticlePreloader(runtime: Runtime) {
  const selectors = selectorsFactory(runtime.location.host, runtime.document)

  function boundLoadChapter(
    url: string,
    onSuccess: (result: { html: string; url: string; nextChapterUrl: string }) => void,
    onFailure: () => void,
  ) {
    loadChapter(runtime, selectors, url, onSuccess, onFailure)
  }

  const controller = createPreloadController(runtime, selectors, boundLoadChapter)

  mergeCurrentChapterIfNeeded(runtime, selectors, () => controller.preloadNextChapter())

  return {
    loadChapter: boundLoadChapter,
    mergeCurrentChapterIfNeeded: (done: () => void) =>
      mergeCurrentChapterIfNeeded(runtime, selectors, done),
    get selectors() {
      return selectors
    },
  }
}
