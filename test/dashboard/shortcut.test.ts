import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import {
  createDoubleShiftHandler,
  handleEscapeKey,
  isEditableTarget,
} from '../../src/dashboard/shortcut'

function makeEvent(
  dom: JSDOM,
  target: EventTarget | null,
  key: string,
  repeat = false,
): KeyboardEvent {
  return new dom.window.KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true })
}

function dispatch(dom: JSDOM, target: EventTarget | null, key: string, repeat = false): void {
  if (!target) {
    throw new Error('dispatch requires a target')
  }
  target.dispatchEvent(makeEvent(dom, target, key, repeat))
}

function emptyDom(): JSDOM {
  return new JSDOM('<!doctype html><html><head></head><body></body></html>')
}

describe('isEditableTarget', () => {
  test('returns true for input/textarea/select', () => {
    const dom = new JSDOM('<input id="a"><textarea id="b"></textarea><select id="c"></select>')
    const doc = dom.window.document
    expect(isEditableTarget(doc.getElementById('a'))).toBe(true)
    expect(isEditableTarget(doc.getElementById('b'))).toBe(true)
    expect(isEditableTarget(doc.getElementById('c'))).toBe(true)
  })
  test('returns true for contenteditable', () => {
    const dom = new JSDOM('<div id="a" contenteditable="true"></div>')
    expect(isEditableTarget(dom.window.document.getElementById('a'))).toBe(true)
  })
  test('returns false for plain elements and null', () => {
    const dom = new JSDOM('<div id="a"></div>')
    expect(isEditableTarget(dom.window.document.getElementById('a'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

describe('createDoubleShiftHandler', () => {
  test('fires on two Shift presses within window', () => {
    const dom = emptyDom()
    let now = 1000
    let fires = 0
    const handler = createDoubleShiftHandler(() => fires++, { windowMs: 400, now: () => now })
    handler(makeEvent(dom, null, 'Shift'))
    now = 1200
    handler(makeEvent(dom, null, 'Shift'))
    expect(fires).toBe(1)
  })
  test('does not fire when presses are too far apart', () => {
    const dom = emptyDom()
    let now = 1000
    let fires = 0
    const handler = createDoubleShiftHandler(() => fires++, { windowMs: 400, now: () => now })
    handler(makeEvent(dom, null, 'Shift'))
    now = 1500
    handler(makeEvent(dom, null, 'Shift'))
    expect(fires).toBe(0)
  })
  test('ignores non-Shift keys', () => {
    const dom = emptyDom()
    let fires = 0
    const handler = createDoubleShiftHandler(() => fires++, { windowMs: 400 })
    handler(makeEvent(dom, null, 'a'))
    handler(makeEvent(dom, null, 'Shift'))
    handler(makeEvent(dom, null, 'a'))
    handler(makeEvent(dom, null, 'Shift'))
    expect(fires).toBe(0)
  })
  test('ignores key repeats', () => {
    const dom = emptyDom()
    let fires = 0
    const handler = createDoubleShiftHandler(() => fires++, { windowMs: 400 })
    handler(makeEvent(dom, null, 'Shift', true))
    handler(makeEvent(dom, null, 'Shift', true))
    expect(fires).toBe(0)
  })
  test('ignores when focus is in editable element', () => {
    const dom = new JSDOM('<input id="a">')
    const input = dom.window.document.getElementById('a')!
    let fires = 0
    const handler = createDoubleShiftHandler(() => fires++, {
      windowMs: 400,
      isFocusExempt: isEditableTarget,
    })
    input.addEventListener('keydown', handler)
    dispatch(dom, input, 'Shift')
    dispatch(dom, input, 'Shift')
    expect(fires).toBe(0)
  })
  test('resets state after a successful double press', () => {
    const dom = emptyDom()
    let now = 1000
    let fires = 0
    const handler = createDoubleShiftHandler(() => fires++, { windowMs: 400, now: () => now })
    handler(makeEvent(dom, null, 'Shift'))
    now = 1200
    handler(makeEvent(dom, null, 'Shift'))
    expect(fires).toBe(1)
    now = 1500
    handler(makeEvent(dom, null, 'Shift'))
    expect(fires).toBe(1)
  })
})

describe('handleEscapeKey', () => {
  function makeShadowRoot(dom: JSDOM): ShadowRoot {
    const host = dom.window.document.createElement('div')
    return host.attachShadow({ mode: 'closed' })
  }

  function dispatchEscape(dom: JSDOM, target: EventTarget): KeyboardEvent {
    const e = new dom.window.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    target.dispatchEvent(e)
    return e
  }

  test('calls onClose when ESC pressed outside editable elements', () => {
    const dom = emptyDom()
    const root = makeShadowRoot(dom)
    let closed = false
    const e = dispatchEscape(dom, dom.window.document.body)
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(true)
  })

  test('does not close when target is an input element', () => {
    const dom = new JSDOM('<input id="a">')
    const root = makeShadowRoot(dom)
    const input = dom.window.document.getElementById('a')!
    let closed = false
    const e = dispatchEscape(dom, input)
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(false)
  })

  test('does not close when target is a textarea element', () => {
    const dom = new JSDOM('<textarea id="b"></textarea>')
    const root = makeShadowRoot(dom)
    const textarea = dom.window.document.getElementById('b')!
    let closed = false
    const e = dispatchEscape(dom, textarea)
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(false)
  })

  test('does not close when target is a select element', () => {
    const dom = new JSDOM('<select id="c"><option>1</option></select>')
    const root = makeShadowRoot(dom)
    const select = dom.window.document.getElementById('c')!
    let closed = false
    const e = dispatchEscape(dom, select)
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(false)
  })

  test('does not close when target has contenteditable', () => {
    const dom = new JSDOM('<div id="d" contenteditable="true"></div>')
    const root = makeShadowRoot(dom)
    const ce = dom.window.document.getElementById('d')!
    let closed = false
    const e = dispatchEscape(dom, ce)
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(false)
  })

  test('ignores non-Escape keys', () => {
    const dom = emptyDom()
    const root = makeShadowRoot(dom)
    let closed = false
    const e = new dom.window.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(false)
  })
})
