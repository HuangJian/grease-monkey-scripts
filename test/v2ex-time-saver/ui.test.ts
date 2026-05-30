import { beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import {
  createCollapseExpandButtons,
  createReferenceDialog,
  createReferenceHint,
  getOrCreateReferenceHintContainer,
} from '../../src/v2ex-time-saver/ui'
import type { Runtime } from '../../src/runtime'
import { createDom, createRuntime } from '../runtime'

describe('ui components', () => {
  let dom: JSDOM
  let runtime: Runtime

  beforeEach(() => {
    dom = createDom(`
      <html><body>
        <div class="cell" id="r_1">
          <table><tbody><tr><td><span class="no">1</span></td></tr></tbody></table>
        </div>
      </body></html>
    `)
    runtime = createRuntime(dom)
  })

  test('createCollapseExpandButtons creates both buttons with correct count', () => {
    const [collapseBtn, expandBtn] = createCollapseExpandButtons(runtime, 3, () => {})

    expect(collapseBtn.classList.contains('collapse')).toBe(true)
    expect(expandBtn.classList.contains('expand')).toBe(true)
    expect(expandBtn.querySelector('span')?.textContent).toContain('（3）')
  })

  test('createReferenceHint creates button with correct text', () => {
    const button = createReferenceHint(runtime, '5', '3', () => {})

    expect(button.className).toBe('gm-reference-hint')
    expect(button.textContent).toBe('↪ #5 也回复了 #3')
  })

  test('getOrCreateReferenceHintContainer creates container after table', () => {
    const cell = dom.window.document.querySelector('.cell')!
    const container = getOrCreateReferenceHintContainer(runtime, cell)

    expect(container.className).toBe('gm-reference-hints')
    expect(container.previousElementSibling?.tagName).toBe('TABLE')
  })

  test('getOrCreateReferenceHintContainer returns existing container', () => {
    const cell = dom.window.document.querySelector('.cell')!
    const container1 = getOrCreateReferenceHintContainer(runtime, cell)
    const container2 = getOrCreateReferenceHintContainer(runtime, cell)

    expect(container1).toBe(container2)
  })

  test('createReferenceDialog creates modal with referenced comment', () => {
    const comment = dom.window.document.querySelector('#r_1')!
    createReferenceDialog(runtime, comment, comment)

    const dialog = dom.window.document.querySelector('.gm-reference-dialog')
    expect(dialog).not.toBeNull()
    expect(dialog?.querySelector('.gm-dialog-context-card')).not.toBeNull()
    expect(dialog?.querySelector('.gm-dialog-reply-card')).not.toBeNull()
  })

  test('createReferenceDialog closes on Escape key', () => {
    const comment = dom.window.document.querySelector('#r_1')!
    createReferenceDialog(runtime, comment, comment)

    expect(dom.window.document.querySelector('.gm-reference-dialog')).not.toBeNull()

    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))

    expect(dom.window.document.querySelector('.gm-reference-dialog')).toBeNull()
  })
})
