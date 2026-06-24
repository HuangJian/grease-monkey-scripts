import type { Runtime } from '../../runtime'
import { findCommentCells, getCommentNumber } from './comment-helpers'
import {
  createCollapseExpandButtons,
  createReferenceDialog,
  createReferenceHint,
  getOrCreateReferenceHintContainer,
} from './ui'

export { getCommentNumber, getCommentElementsFromHtmlString } from './comment-helpers'

export function getCommentAuthorName(comment: Element): string {
  return (
    comment
      .querySelector(":scope > table strong a.dark[href^='/member/']")
      ?.getAttribute('href')
      ?.split('/')[2] || ''
  )
}

export function getOwnReplyContent(comment: Element): Element | null {
  return comment.querySelector(':scope > table .reply_content')
}

export function getLastCommentByAuthorBeforeNumber(
  authorComments: Element[],
  currentCommentNumber: number,
): Element | null {
  return (
    authorComments
      .filter((comment) => {
        const commentNumber = parseInt(getCommentNumber(comment), 10)
        return commentNumber < currentCommentNumber
      })
      .at(-1) || null
  )
}

export function getCommentHearts(comment: Element): number {
  return Array.from(comment.querySelectorAll('[alt="❤️"]'))
    .map((it) => parseInt(it.nextSibling?.textContent || '0', 10))
    .reduce((prev, curr) => prev + curr, 0)
}

export function getTextUntilNextMemberMention(mention: Element): string {
  let text = ''
  let node = mention.nextSibling

  while (node) {
    if (node.nodeType === 1) {
      const element = node as Element
      if (element.matches("a[href^='/member/']")) {
        break
      }
      text += element.textContent || ''
    } else {
      text += node.textContent || ''
    }
    node = node.nextSibling
  }

  return text
}

export function getExplicitMentionedComment(
  mention: Element,
  commentByNumber: Map<string, Element>,
): Element | null {
  const numberMatch = /#(\d+)/.exec(getTextUntilNextMemberMention(mention))
  if (!numberMatch) {
    return null
  }

  return commentByNumber.get(numberMatch[1]) || null
}

export function getMentionedComments(
  currentComment: Element,
  commentByNumber: Map<string, Element>,
  commentsByAuthor: Map<string, Element[]>,
): Element[] {
  const currentCommentNumber = parseInt(getCommentNumber(currentComment), 10)
  const replyContent = getOwnReplyContent(currentComment)
  if (!replyContent) {
    return []
  }

  const seenComments = new Set<Element>()
  const mentionedComments: Element[] = []
  const mentions = replyContent.querySelectorAll("a[href^='/member/']")

  mentions.forEach((mention) => {
    const mentionedPeopleName =
      mention.getAttribute('href')?.split('/')[2] || (mention.textContent || '').replace(/^@/, '')
    let mentionedComment = getExplicitMentionedComment(mention, commentByNumber)
    if (!mentionedComment) {
      mentionedComment = getLastCommentByAuthorBeforeNumber(
        commentsByAuthor.get(mentionedPeopleName) || [],
        currentCommentNumber,
      )
    }
    if (
      !mentionedComment ||
      mentionedComment === currentComment ||
      seenComments.has(mentionedComment)
    ) {
      return
    }
    seenComments.add(mentionedComment)
    mentionedComments.push(mentionedComment)
  })

  return mentionedComments
}

export function embedDiscussions(runtime: Runtime): void {
  const comments = findCommentCells(runtime.document)
  console.debug('[v2ex] embedDiscussions', { commentCount: comments.length })

  const commentByNumber = new Map<string, Element>(
    comments
      .map((comment) => [getCommentNumber(comment), comment] as const)
      .filter(([number]) => number),
  )

  const commentsByAuthor = new Map<string, Element[]>()
  comments.forEach((comment) => {
    const authorName = getCommentAuthorName(comment)
    if (!authorName) {
      return
    }
    commentsByAuthor.set(authorName, [...(commentsByAuthor.get(authorName) || []), comment])
  })

  const plans = comments
    .slice()
    .reverse()
    .map((currentComment) => ({
      currentComment,
      mentionedComments: getMentionedComments(currentComment, commentByNumber, commentsByAuthor),
    }))
    .filter(({ mentionedComments }) => mentionedComments.length > 0)

  console.debug('[v2ex] embedDiscussions plans', { planCount: plans.length })

  plans.forEach(({ currentComment, mentionedComments }) => {
    if (mentionedComments.length === 0) {
      return
    }

    const sortedByHearts = mentionedComments
      .slice()
      .sort((a, b) => getCommentHearts(b) - getCommentHearts(a))

    const [primaryComment, ...secondaryComments] = sortedByHearts

    primaryComment
      .querySelector(':scope > table')
      ?.insertAdjacentElement('afterend', currentComment)
    currentComment.setAttribute('data-is-embedded', 'true')

    secondaryComments.forEach((referencedComment) =>
      addReferenceHint(runtime, referencedComment, currentComment),
    )
  })
}

function addReferenceHint(runtime: Runtime, referencedComment: Element, comment: Element): void {
  const commentNumber = getCommentNumber(comment)
  const referencedCommentNumber = getCommentNumber(referencedComment)
  const container = getOrCreateReferenceHintContainer(runtime, referencedComment)
  const button = createReferenceHint(runtime, commentNumber, referencedCommentNumber, () =>
    createReferenceDialog(runtime, comment, referencedComment),
  )
  container.appendChild(button)
}

export function addCollapseExpandButtons(runtime: Runtime): void {
  runtime.document.querySelectorAll('.cell[id] > .cell[id]').forEach((embedded) => {
    const discussionCount = 1 + embedded.querySelectorAll('.cell[id]').length
    const [collapseBtn, expandBtn] = createCollapseExpandButtons(
      runtime,
      discussionCount,
      toggleDiscussionVisibility,
    )
    embedded.insertAdjacentElement('afterbegin', collapseBtn)
    embedded.insertAdjacentElement('afterbegin', expandBtn)
  })
}

function toggleDiscussionVisibility(evt: Event): void {
  const clickedButton = (evt.target as Element | null)?.closest('button')
  const comment = clickedButton?.closest('.cell[id]')
  comment?.classList.toggle('discussions-collapsed')
}
