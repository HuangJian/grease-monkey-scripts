import type { Runtime } from '../../../runtime'
import type { XitLine, NamedFilter } from '../types'
import { updateFilter } from '../filters'
import { renderSavedFilters } from './saved-filters'

export type XitRenderOptions = {
  onSaveText: (newText: string) => void
  openEditor?: (lineIndex?: number) => void
  runtime?: Runtime
}

export function showEditForm(
  card: HTMLElement,
  wrapper: HTMLElement,
  filter: NamedFilter,
  lines: XitLine[],
  options: XitRenderOptions,
): void {
  const existingForm = card.querySelector('.gm-sp-xit-save-form')
  if (existingForm) existingForm.remove()

  const formFragment = card.ownerDocument.createRange().createContextualFragment(
    `<div class="gm-sp-xit-save-form">
      <input type="text" class="gm-sp-xit-save-name" placeholder="Name" value="${filter.name}">
      <input type="text" class="gm-sp-xit-save-query" placeholder="Query" value="${filter.query}">
      <button type="button" class="gm-sp-xit-save-confirm">Save</button>
      <button type="button" class="gm-sp-xit-save-cancel">Cancel</button>
    </div>`,
  )
  const formEl = formFragment.firstElementChild as HTMLElement
  const nameInput = formEl.querySelector('.gm-sp-xit-save-name') as HTMLInputElement
  const queryInput = formEl.querySelector('.gm-sp-xit-save-query') as HTMLInputElement
  const confirmBtn = formEl.querySelector('.gm-sp-xit-save-confirm') as HTMLButtonElement
  const cancelBtn = formEl.querySelector('.gm-sp-xit-save-cancel') as HTMLButtonElement

  const headerRow = card.querySelector('.gm-sp-xit-header-row')
  if (headerRow?.nextElementSibling) {
    headerRow.parentElement!.insertBefore(formEl, headerRow.nextElementSibling)
  }

  nameInput.focus()
  nameInput.select()

  confirmBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim()
    const q = queryInput.value.trim()
    if (!name || !q || !options.runtime) return
    await updateFilter(options.runtime, filter.id, { name, query: q })
    formEl.remove()
    renderSavedFilters(card, wrapper, lines, options)
  })

  cancelBtn.addEventListener('click', () => {
    formEl.remove()
  })

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmBtn.click()
    if (e.key === 'Escape') cancelBtn.click()
    e.stopPropagation()
  })
  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmBtn.click()
    if (e.key === 'Escape') cancelBtn.click()
    e.stopPropagation()
  })
}
