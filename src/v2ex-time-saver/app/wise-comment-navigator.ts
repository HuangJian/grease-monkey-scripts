import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import { getTotalScore } from '../../shared/author-labels'

const MIN_COMMENTS = 30

function collectWiseComments(runtime: Runtime, authorTagMap: AuthorTagMap): Element[] {
  const allComments = Array.from(runtime.document.querySelectorAll('#Main .cell[id]'))
  if (allComments.length < MIN_COMMENTS) return []

  return allComments.filter((cell) => {
    const authorLink = cell.querySelector('strong > a[href]')
    if (!authorLink) return false
    const id = authorLink.getAttribute('href')?.split('/')[2]
    if (!id) return false
    return getTotalScore(authorTagMap[id]) > 0
  })
}

export function addWiseCommentNavigator(runtime: Runtime, authorTagMap: AuthorTagMap): void {
  const wiseComments = collectWiseComments(runtime, authorTagMap)
  if (wiseComments.length < 2) return

  let currentIndex = 0

  const upSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>`
  const downSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>`

  runtime.document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-wise-navigator">
      <button class="gm-wise-nav-btn gm-wise-nav-up" title="上一个智者回复 (E)">${upSvg}<kbd class="gm-wise-nav-hint">E</kbd></button>
      <button class="gm-wise-nav-btn gm-wise-nav-down" title="下一个智者回复 (D)">${downSvg}<kbd class="gm-wise-nav-hint">D</kbd></button>
    </div>`,
  )
  const container = runtime.document.body.lastElementChild as HTMLElement
  const upBtn = container.querySelector('.gm-wise-nav-up') as HTMLButtonElement
  const downBtn = container.querySelector('.gm-wise-nav-down') as HTMLButtonElement

  function scrollTo(index: number): void {
    currentIndex = index
    wiseComments[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function goUp(): void {
    scrollTo(currentIndex > 0 ? currentIndex - 1 : wiseComments.length - 1)
  }

  function goDown(): void {
    scrollTo(currentIndex < wiseComments.length - 1 ? currentIndex + 1 : 0)
  }

  upBtn.addEventListener('click', goUp)
  downBtn.addEventListener('click', goDown)

  runtime.addEventListener(runtime.document, 'keydown', (e: Event) => {
    const evt = e as KeyboardEvent
    if (evt.isComposing) return
    const tag = (evt.target as Element)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (evt.key === 'e' || evt.key === 'E') {
      evt.preventDefault()
      goUp()
    } else if (evt.key === 'd' || evt.key === 'D') {
      evt.preventDefault()
      goDown()
    }
  })
}
