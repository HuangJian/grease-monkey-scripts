import type { Runtime } from '../runtime'
import type { AuthorTagMap } from './author-labels'
import { defaultLabels } from './author-labels'
import { htmlToElement } from '../utils'

export function addTagPanel(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  onTagAuthor: (id: string, commentNumber: number | string, tag: string, delta: number) => void,
  onSetTag: (id: string, tag: string, score: number, commentNumber: number | string) => void,
  onUnsetTag: (id: string, tag: string) => void,
): void {
  const btnClass = 'gm-tag-btn'

  let closeOutsideClick: (() => void) | null = null

  function closePanel(): void {
    closeOutsideClick?.()
    closeOutsideClick = null
    const panel = runtime.document.querySelector('.gm-tag-panel')
    if (panel) panel.remove()
  }

  function buildPanel(id: string, commentNumber: number | string, btn: Element): void {
    closePanel()

    const panel = htmlToElement<HTMLElement>(
      runtime.document,
      `<div class="gm-tag-panel">
        <div class="gm-tag-panel-header">
          <span class="gm-tag-panel-title"></span>
          <button class="gm-tag-panel-close">✕</button>
        </div>
        <div class="gm-tag-list"></div>
        <div class="gm-tag-add">
          <input class="gm-tag-input-name" type="text" placeholder="标签名">
          <input class="gm-tag-input-score" type="number" value="0" step="1">
          <button class="gm-tag-add-btn">添加</button>
        </div>
        <div class="gm-tag-quick">
          <button class="gm-tag-quick-shame">不说人话 (-1)</button>
          <button class="gm-tag-quick-thank">智者 (+1)</button>
        </div>
      </div>`,
    )

    panel.querySelector('.gm-tag-panel-title')!.textContent = id

    const list = panel.querySelector('.gm-tag-list')!

    function renderTags(): void {
      const currentTags = authorTagMap[id] || {}
      const entries = Object.entries(currentTags)
      list.innerHTML = ''
      if (entries.length === 0) {
        const empty = runtime.document.createElement('div')
        empty.className = 'gm-tag-empty'
        empty.textContent = '暂无标签'
        list.appendChild(empty)
        return
      }
      for (const [tagName, record] of entries) {
        const row = runtime.document.createElement('div')
        row.className = 'gm-tag-row'

        const nameSpan = runtime.document.createElement('span')
        nameSpan.className = 'gm-tag-name'
        nameSpan.textContent = tagName
        row.appendChild(nameSpan)

        const scoreSpan = runtime.document.createElement('span')
        scoreSpan.className = 'gm-tag-score'
        scoreSpan.textContent = record.score > 0 ? `+${record.score}` : String(record.score)
        row.appendChild(scoreSpan)

        const incBtn = runtime.document.createElement('button')
        incBtn.className = 'gm-tag-inc'
        incBtn.textContent = '+1'
        incBtn.addEventListener('click', () => {
          onTagAuthor(id, commentNumber, tagName, 1)
          renderTags()
        })
        row.appendChild(incBtn)

        const decBtn = runtime.document.createElement('button')
        decBtn.className = 'gm-tag-dec'
        decBtn.textContent = '-1'
        decBtn.addEventListener('click', () => {
          onTagAuthor(id, commentNumber, tagName, -1)
          renderTags()
        })
        row.appendChild(decBtn)

        const delBtn = runtime.document.createElement('button')
        delBtn.className = 'gm-tag-del'
        delBtn.textContent = '删除'
        delBtn.addEventListener('click', () => {
          onUnsetTag(id, tagName)
          renderTags()
        })
        row.appendChild(delBtn)

        list.appendChild(row)
      }
    }

    const addNameInput = panel.querySelector('.gm-tag-input-name')! as HTMLInputElement
    const addScoreInput = panel.querySelector('.gm-tag-input-score')! as HTMLInputElement
    panel.querySelector('.gm-tag-add-btn')!.addEventListener('click', () => {
      const name = addNameInput.value.trim()
      if (!name) return
      const score = parseInt(addScoreInput.value, 10)
      if (score === 0 || isNaN(score)) return
      onSetTag(id, name, score, commentNumber)
      addNameInput.value = ''
      addScoreInput.value = '0'
      renderTags()
    })

    panel.querySelector('.gm-tag-quick-shame')!.addEventListener('click', () => {
      onTagAuthor(id, commentNumber, defaultLabels.shame, -1)
      renderTags()
    })
    panel.querySelector('.gm-tag-quick-thank')!.addEventListener('click', () => {
      onTagAuthor(id, commentNumber, defaultLabels.thank, 1)
      renderTags()
    })

    panel.querySelector('.gm-tag-panel-close')!.addEventListener('click', closePanel)

    renderTags()

    const rect = btn.getBoundingClientRect()
    panel.style.position = 'fixed'
    panel.style.top = `${rect.bottom + 4}px`
    panel.style.left = `${Math.min(rect.left, (runtime.document.defaultView?.innerWidth ?? 320) - 320)}px`

    runtime.document.body.appendChild(panel)

    const handler = (e: MouseEvent) => {
      if ((e.target as Element).closest(`.${btnClass}`)) return
      if (!panel.contains(e.target as Node)) {
        closePanel()
      }
    }
    closeOutsideClick = () => {
      runtime.document.removeEventListener('mousedown', handler)
    }
    setTimeout(() => {
      if (!closeOutsideClick) return
      runtime.document.addEventListener('mousedown', handler)
    }, 0)
  }

  function ensureTagBtn(
    container: Element,
    id: string,
    commentNumber: number | string,
    ref: Element | null,
  ): void {
    if (container.querySelector(`.${btnClass}`)) return
    const btn = runtime.document.createElement('a')
    btn.className = btnClass
    btn.textContent = '🏷'
    btn.setAttribute('href', '#;')
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      buildPanel(id, commentNumber, btn)
    })
    if (ref) {
      ref.insertAdjacentElement('afterend', btn)
    } else {
      container.appendChild(btn)
    }
  }

  const topicAuthorId = runtime.document.querySelector('.header .avatar')?.getAttribute('alt')
  if (topicAuthorId) {
    const topicButtons = runtime.document.querySelector('.topic_buttons')
    if (topicButtons) {
      ensureTagBtn(topicButtons, topicAuthorId, 0, null)
    }
  }

  runtime.document.querySelectorAll('.cell').forEach((cell) => {
    const authorLink = cell.querySelector('strong > a[href]')
    if (!authorLink) return
    const id = authorLink.getAttribute('href')?.split('/')[2]
    if (!id) return
    const commentNumber = cell.querySelector('span.no')?.textContent?.trim()
    if (!commentNumber) return
    ensureTagBtn(cell, id, commentNumber, authorLink)
  })
}
