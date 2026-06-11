import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../author-labels'
import { escapeHtml } from '../../utils'
import type { TagPanelCallbacks, QuickLabels } from './types'
import { closeTagPanel, registerOutsideClick } from './behavior'
import { positionPanel } from './position'

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

  runtime.document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-tag-panel">
      <div class="gm-tag-panel-header">
        <span class="gm-tag-panel-title">${authorId}</span>
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
  const panel = runtime.document.body.querySelector('.gm-tag-panel') as HTMLElement
  const list = panel.querySelector('.gm-tag-list')!

  function renderTags(): void {
    const currentTags = authorTagMap[authorId] || {}
    const entries = Object.entries(currentTags)
    list.innerHTML = ''
    if (entries.length === 0) {
      list.insertAdjacentHTML('beforeend', '<div class="gm-tag-empty">暂无标签</div>')
      return
    }
    list.insertAdjacentHTML(
      'beforeend',
      entries
        .map(([tagName, record]) => {
          const scoreText = record.score > 0 ? `+${record.score}` : String(record.score)
          return `<div class="gm-tag-row" data-tag-name="${escapeHtml(tagName)}">
          <span class="gm-tag-name">${escapeHtml(tagName)}</span>
          <span class="gm-tag-score">${escapeHtml(scoreText)}</span>
          <button class="gm-tag-inc">+1</button>
          <button class="gm-tag-dec">-1</button>
          <button class="gm-tag-del">删除</button>
        </div>`
        })
        .join(''),
    )
    list.querySelectorAll<HTMLElement>('.gm-tag-row').forEach((row) => {
      const tagName = row.dataset['tagName']!
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
    })
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

  positionPanel(runtime, panel, triggerBtn)
  registerOutsideClick(runtime, panel, btnClass)
}
