import type { Runtime } from '../../runtime'
import { findSiteConfig, selectorsFromConfig } from '../selectors'
import { loadChapter } from './chapter-loader'
import { mergeCurrentChapterIfNeeded } from './merge-current-page'
import { createPreloadController } from './preload-controller'
import { wireKeyboardNav } from './keyboard'

export { findChapterLink, findSiteConfig, selectorsFactory } from '../selectors'

export function startArticlePreloader(runtime: Runtime) {
  const config = findSiteConfig(runtime.location.host, runtime.document)
  // The script matches every URL, so most pages are simply not novels. Bail out
  // quietly instead of throwing on pages we do not support.
  if (!config) return undefined
  const selectors = selectorsFromConfig(config, runtime.document)

  function boundLoadChapter(
    url: string,
    onSuccess: (result: { html: string; url: string; nextChapterUrl: string }) => void,
    onFailure: () => void,
  ) {
    loadChapter(runtime, selectors, url, onSuccess, onFailure)
  }

  const controller = createPreloadController(runtime, selectors, boundLoadChapter)

  // Wire once at startup. Registering only after a successful preload left the
  // arrow keys dead whenever the fetch was slow, retried, or failed.
  wireKeyboardNav(runtime.document, selectors, () => controller.requestNextChapter())

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
