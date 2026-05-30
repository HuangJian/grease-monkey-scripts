import type { Runtime } from '../runtime'

export function getCommentNumber(comment: Element): string {
  return comment.querySelector('.no')?.textContent?.trim() || ''
}

export function getCommentElementsFromHtmlString(
  runtime: Runtime,
  htmlString: string,
): NodeListOf<Element> {
  const domParser = new runtime.DOMParser()
  const dom = domParser.parseFromString(htmlString, 'text/html')
  return dom.querySelectorAll('#Main > .box > .cell[id]')
}
