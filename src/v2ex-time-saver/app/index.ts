import type { Runtime } from '../../runtime'
import {
  addTag,
  getTotalScore,
  incrementTagScore,
  removeTag,
  toRelativeUrl,
} from '../../shared/author-labels'
import type { TagPanelCallbacks, QuickLabels } from '../../shared/tag-panel'
import { checkAndDoSignIn } from '../sign-in'
import { embedDiscussions } from '../discussion-embedder'
import {
  highlightCommentsAndTopics,
  addTargetToTopicLinks,
  reorderCommentsByHearts,
} from '../thread-enhancements'
import { getCommentElementsFromHtmlString } from '../comment-helpers'
import { enhanceThreadPage } from './thread-page'
import { createMultiPageLoader } from './multi-page-comments'
import { addStyles } from './styles'
import { loadAuthorTagMap, persistAuthorTags } from './author-tags'

export { authorTagsKeyword } from './author-tags'

export const defaultLabels = {
  shame: '若婴',
  thank: '智者',
} as const

export type V2exApp = Awaited<ReturnType<typeof createV2exApp>>

export async function startV2exTimeSaver(runtime: Runtime): Promise<void> {
  console.debug('[gm-v2ex-time-saver] start')
  try {
    const app = await createV2exApp(runtime)
    app.start()
    console.debug('[gm-v2ex-time-saver] start done')
  } catch (e) {
    console.error('[gm-v2ex-time-saver] error', e)
  }
}

function buildAuthorUrl(runtime: Runtime, commentNumber: number | string): string {
  return `${runtime.location.origin}${runtime.location.pathname}#${commentNumber}`
}

export async function createV2exApp(runtime: Runtime) {
  const authorTagMap = await loadAuthorTagMap(runtime)

  function persist(): void {
    persistAuthorTags(runtime, authorTagMap)
  }

  function rehighlight(): void {
    highlightCommentsAndTopics(runtime, authorTagMap)
  }

  function tagAuthor(id: string, commentNumber: number | string, tag: string, delta: number): void {
    const url = toRelativeUrl(buildAuthorUrl(runtime, commentNumber))
    incrementTagScore(authorTagMap, id, tag, url, delta)
    persist()
    rehighlight()
  }

  function setTag(id: string, tag: string, score: number, commentNumber: number | string): void {
    const url = toRelativeUrl(buildAuthorUrl(runtime, commentNumber))
    addTag(authorTagMap, id, tag, url, score)
    persist()
    rehighlight()
  }

  function unsetTag(id: string, tag: string): void {
    removeTag(authorTagMap, id, tag)
    persist()
    rehighlight()
  }

  const callbacks: TagPanelCallbacks = {
    onTagAuthor: tagAuthor,
    onSetTag: setTag,
    onUnsetTag: unsetTag,
  }
  const quickLabels: QuickLabels = {
    shame: { tag: defaultLabels.shame, display: '不说人话' },
    thank: { tag: defaultLabels.thank, display: defaultLabels.thank },
  }

  function start() {
    const isReadingTopic = runtime.location.href.indexOf('v2ex.com/t/') > 0
    console.debug('[gm-v2ex-time-saver] start', { isReadingTopic, url: runtime.location.href })

    addStyles(runtime)
    checkAndDoSignIn(runtime)

    const allPageNumbers = Array.from(
      runtime.document.querySelectorAll('.page_current, .page_normal'),
    )
      .map((it) => parseInt(it.textContent || '', 10))
      .filter((it) => isReadingTopic && !isNaN(it) && it >= 1 && it <= 10)
      .filter((x, i, a) => a.indexOf(x) === i)
      .sort((a, b) => a - b)

    console.debug('[gm-v2ex-time-saver] pageNumbers', allPageNumbers)

    if (!allPageNumbers.length) {
      console.debug('[gm-v2ex-time-saver] single page — enhanceThreadPage')
      enhanceThreadPage(runtime, authorTagMap, callbacks, quickLabels)
      return
    }

    const currentPageEl = runtime.document.querySelector('.page_current')
    const currentPageNum = currentPageEl
      ? parseInt(currentPageEl.textContent || '', 10)
      : parseInt(new URL(runtime.location.href).searchParams.get('p') || '1', 10) || 1

    console.debug('[gm-v2ex-time-saver] multi-page', { currentPageNum, allPageNumbers })

    const loader = createMultiPageLoader(runtime, authorTagMap, callbacks, quickLabels)
    loader.loadAllPages(allPageNumbers, currentPageNum)
  }

  return {
    addTargetToTopicLinks,
    embedDiscussions,
    getCommentElementsFromHtmlString: (html: string) =>
      getCommentElementsFromHtmlString(runtime, html),
    highlightCommentsAndTopics: () => rehighlight(),
    tagAuthor,
    setTag,
    unsetTag,
    getTags: (id: string) => (authorTagMap[id] ? { ...authorTagMap[id] } : undefined),
    getScore: (id: string) => getTotalScore(authorTagMap[id]),
    getAuthorTagMap: () => JSON.parse(JSON.stringify(authorTagMap)),
    reorderCommentsByHearts,
    start,
  }
}
