import type { Runtime } from '../runtime'
import type { AuthorTagMap } from './author-labels'
import { htmlToElement } from '../utils'

export const tagPanelCss = `.gm-tag-btn {
  cursor: pointer;
  margin-left: 4px;
  font-size: 12px;
  text-decoration: none;
  user-select: none;
}
.gm-tag-btn:hover {
  text-decoration: none;
}
.gm-tag-panel {
  position: fixed;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 12px;
  min-width: 240px;
  max-width: 300px;
  font-size: 13px;
  line-height: 1.5;
  z-index: 9999;
}
.gm-tag-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: bold;
  font-size: 14px;
}
.gm-tag-panel-close {
  cursor: pointer;
  border: none;
  background: none;
  font-size: 16px;
  padding: 0 4px;
  color: #999;
}
.gm-tag-panel-close:hover {
  color: #333;
}
.gm-tag-list {
  margin-bottom: 4px;
}
.gm-tag-empty {
  color: #999;
  font-size: 12px;
  padding: 4px 0;
}
.gm-tag-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 0;
  border-bottom: 1px solid #f0f0f0;
}
.gm-tag-row:last-child {
  border-bottom: none;
}
.gm-tag-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.gm-tag-score {
  min-width: 24px;
  text-align: center;
  font-weight: bold;
  font-size: 12px;
}
.gm-tag-row button {
  cursor: pointer;
  border: 1px solid #d0d0d0;
  border-radius: 3px;
  background: #f8f8f8;
  padding: 1px 6px;
  font-size: 11px;
  line-height: 1.4;
}
.gm-tag-row button:hover {
  background: #e8e8e8;
}
.gm-tag-del {
  color: #c00;
}
.gm-tag-add {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e0e0e0;
}
.gm-tag-input-name {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid #d0d0d0;
  border-radius: 3px;
  font-size: 12px;
}
.gm-tag-input-score {
  width: 48px;
  padding: 3px 6px;
  border: 1px solid #d0d0d0;
  border-radius: 3px;
  font-size: 12px;
  text-align: center;
}
.gm-tag-add-btn {
  cursor: pointer;
  border: 1px solid #4a90d9;
  border-radius: 3px;
  background: #4a90d9;
  color: white;
  padding: 3px 10px;
  font-size: 12px;
  white-space: nowrap;
}
.gm-tag-add-btn:hover {
  background: #357abd;
}
.gm-tag-quick {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e0e0e0;
}
.gm-tag-quick button {
  cursor: pointer;
  border: 1px solid #d0d0d0;
  border-radius: 3px;
  padding: 3px 10px;
  font-size: 12px;
  background: #f8f8f8;
  flex: 1;
}
.gm-tag-quick button:hover {
  background: #e8e8e8;
}
.gm-tag-quick-shame {
  color: #c00;
}
.gm-tag-quick-thank {
  color: #080;
}`

export type TagPanelCallbacks = {
  onTagAuthor: (id: string, commentNumber: number | string, tag: string, delta: number) => void
  onSetTag: (id: string, tag: string, score: number, commentNumber: number | string) => void
  onUnsetTag: (id: string, tag: string) => void
}

export type QuickButtonConfig = {
  tag: string
  display: string
}

export type QuickLabels = {
  shame: QuickButtonConfig
  thank: QuickButtonConfig
}

let closePanelHandler: (() => void) | null = null

export function closeTagPanel(runtime: Runtime): void {
  closePanelHandler?.()
  closePanelHandler = null
  runtime.document.querySelector('.gm-tag-panel')?.remove()
}

export function buildTagPanel(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  authorId: string,
  commentNumber: number | string,
  triggerBtn: Element,
  callbacks: TagPanelCallbacks,
  quickLabels: QuickLabels,
): void {
  closeTagPanel(runtime)

  const btnClass = 'gm-tag-btn'

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
        <button class="gm-tag-quick-shame">${quickLabels.shame.display} (-1)</button>
        <button class="gm-tag-quick-thank">${quickLabels.thank.display} (+1)</button>
      </div>
    </div>`,
  )

  panel.querySelector('.gm-tag-panel-title')!.textContent = authorId

  const list = panel.querySelector('.gm-tag-list')!

  function renderTags(): void {
    const currentTags = authorTagMap[authorId] || {}
    const entries = Object.entries(currentTags)
    list.innerHTML = ''
    if (entries.length === 0) {
      list.appendChild(htmlToElement(runtime.document, '<div class="gm-tag-empty">暂无标签</div>'))
      return
    }
    for (const [tagName, record] of entries) {
      const scoreText = record.score > 0 ? `+${record.score}` : String(record.score)
      const row = htmlToElement<HTMLElement>(
        runtime.document,
        `<div class="gm-tag-row">
          <span class="gm-tag-name"></span>
          <span class="gm-tag-score">${scoreText}</span>
          <button class="gm-tag-inc">+1</button>
          <button class="gm-tag-dec">-1</button>
          <button class="gm-tag-del">删除</button>
        </div>`,
      )

      row.querySelector('.gm-tag-name')!.textContent = tagName

      const [incBtn, decBtn, delBtn] = row.querySelectorAll('button')
      incBtn.addEventListener('click', () => {
        callbacks.onTagAuthor(authorId, commentNumber, tagName, 1)
        renderTags()
      })
      decBtn.addEventListener('click', () => {
        callbacks.onTagAuthor(authorId, commentNumber, tagName, -1)
        renderTags()
      })
      delBtn.addEventListener('click', () => {
        callbacks.onUnsetTag(authorId, tagName)
        renderTags()
      })

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
    callbacks.onSetTag(authorId, name, score, commentNumber)
    addNameInput.value = ''
    addScoreInput.value = '0'
    renderTags()
  })

  panel.querySelector('.gm-tag-quick-shame')!.addEventListener('click', () => {
    callbacks.onTagAuthor(authorId, commentNumber, quickLabels.shame.tag, -1)
    renderTags()
  })
  panel.querySelector('.gm-tag-quick-thank')!.addEventListener('click', () => {
    callbacks.onTagAuthor(authorId, commentNumber, quickLabels.thank.tag, 1)
    renderTags()
  })

  panel
    .querySelector('.gm-tag-panel-close')!
    .addEventListener('click', () => closeTagPanel(runtime))

  renderTags()

  const rect = triggerBtn.getBoundingClientRect()
  panel.style.position = 'fixed'
  panel.style.top = `${rect.bottom + 4}px`
  panel.style.left = `${Math.min(rect.left, (runtime.document.defaultView?.innerWidth ?? 320) - 320)}px`

  runtime.document.body.appendChild(panel)

  const handler = (e: MouseEvent) => {
    if ((e.target as Element).closest(`.${btnClass}`)) return
    if (!panel.contains(e.target as Node)) {
      closeTagPanel(runtime)
    }
  }
  closePanelHandler = () => {
    runtime.document.removeEventListener('mousedown', handler)
  }
  setTimeout(() => {
    if (!closePanelHandler) return
    runtime.document.addEventListener('mousedown', handler)
  }, 0)
}
