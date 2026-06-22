import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import { embedDiscussions, addCollapseExpandButtons } from './discussion-embedder'
import {
  reorderCommentsByHearts,
  highlightCommentsAndTopics,
  addTargetToTopicLinks,
  scrollToComment,
} from './thread-enhancements'
import { addWiseCommentNavigator } from './wise-comment-navigator'
import { addTagPanel } from './tag-buttons'
import type { TagPanelCallbacks, QuickLabels } from '../../shared/tag-panel'

function scrollToCommentByHash(runtime: Runtime): void {
  const hash = runtime.location.hash
  if (!/^#\d+$/.test(hash)) return
  scrollToComment(hash.slice(1), runtime)
}

export function enhanceThreadPage(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  callbacks: TagPanelCallbacks,
  quickLabels: QuickLabels,
): void {
  console.debug('[gm-v2ex-time-saver] enhanceThreadPage start')
  embedDiscussions(runtime)
  reorderCommentsByHearts(runtime)
  addCollapseExpandButtons(runtime)
  addTagPanel(runtime, authorTagMap, callbacks, quickLabels)
  highlightCommentsAndTopics(runtime, authorTagMap)
  addWiseCommentNavigator(runtime, authorTagMap)
  addTargetToTopicLinks(runtime)
  scrollToCommentByHash(runtime)
  console.debug('[gm-v2ex-time-saver] enhanceThreadPage done')
}
