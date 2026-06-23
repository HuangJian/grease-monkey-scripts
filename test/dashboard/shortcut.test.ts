import { describe, expect, test, afterAll } from 'bun:test'
import { Window } from 'happy-dom'
import { createHappyDom, closeAllWindows } from '../runtime'
import {
  createDoubleShiftHandler,
  handleEscapeKey,
  isEditableTarget,
} from '../../src/dashboard/shortcut'

function makeEvent(
  dom: Window,
  target: EventTarget | null,
  key: string,
  repeat = false,
): KeyboardEvent {
  return new dom.KeyboardEvent('keydown', {
    key,
    repeat,
    bubbles: true,
    cancelable: true,
  }) as unknown as KeyboardEvent
}

function dispatch(dom: Window, target: EventTarget | null, key: string, repeat = false): void {
  if (!target) {
    throw new Error('dispatch requires a target')
  }
  target.dispatchEvent(makeEvent(dom, target, key, repeat))
}

function emptyDom(): Window {
  return createHappyDom('<!doctype html><html><head></head><body></body></html>')
}

describe('isEditableTarget', () => {
  test('returns true for input/textarea/select', () => {
    const dom = createHappyDom('<input id="a"><textarea id="b"></textarea><select id="c"></select>')
    const doc = dom.document
    expect(isEditableTarget(doc.getElementById('a') as unknown as Element)).toBe(true)
    expect(isEditableTarget(doc.getElementById('b') as unknown as Element)).toBe(true)
    expect(isEditableTarget(doc.getElementById('c') as unknown as Element)).toBe(true)
  })
  test('returns true for contenteditable', () => {
    const dom = createHappyDom('<div id="a" contenteditable="true"></div>')
    expect(isEditableTarget(dom.document.getElementById('a') as unknown as Element)).toBe(true)
  })
  test('returns false for plain elements and null', () => {
    const dom = createHappyDom('<div id="a"></div>')
    expect(isEditableTarget(dom.document.getElementById('a') as unknown as Element)).toBe(false)
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
    const dom = createHappyDom('<input id="a">')
    const input = dom.document.getElementById('a')!
    let fires = 0
    const handler = createDoubleShiftHandler(() => fires++, {
      windowMs: 400,
      isFocusExempt: isEditableTarget,
    })
    ;(input as unknown as EventTarget).addEventListener('keydown', handler as EventListener)
    dispatch(dom, input as unknown as EventTarget, 'Shift')
    dispatch(dom, input as unknown as EventTarget, 'Shift')
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
  function makeShadowRoot(dom: Window): ShadowRoot {
    const host = dom.document.createElement('div')
    return host.attachShadow({ mode: 'closed' }) as unknown as unknown as ShadowRoot
  }

  function dispatchEscape(dom: Window, target: EventTarget): KeyboardEvent {
    const e = new dom.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }) as unknown as KeyboardEvent
    target.dispatchEvent(e)
    return e
  }

  test('calls onClose when ESC pressed outside editable elements', () => {
    const dom = emptyDom()
    const root = makeShadowRoot(dom)
    let closed = false
    const e = dispatchEscape(dom, dom.document.body as unknown as unknown as EventTarget)
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(true)
  })

  test('does not close when target is an input element', () => {
    const dom = createHappyDom('<input id="a">')
    const root = makeShadowRoot(dom)
    const input = dom.document.getElementById('a')!
    let closed = false
    const e = dispatchEscape(dom, input as unknown as unknown as EventTarget)
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(false)
  })

  test('does not close when target is a textarea element', () => {
    const dom = createHappyDom('<textarea id="b"></textarea>')
    const root = makeShadowRoot(dom)
    const textarea = dom.document.getElementById('b')!
    let closed = false
    const e = dispatchEscape(dom, textarea as unknown as unknown as EventTarget)
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(false)
  })

  test('does not close when target is a select element', () => {
    const dom = createHappyDom('<select id="c"><option>1</option></select>')
    const root = makeShadowRoot(dom)
    const select = dom.document.getElementById('c')!
    let closed = false
    const e = dispatchEscape(dom, select as unknown as unknown as EventTarget)
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(false)
  })

  test('does not close when target has contenteditable', () => {
    const dom = createHappyDom('<div id="d" contenteditable="true"></div>')
    const root = makeShadowRoot(dom)
    const ce = dom.document.getElementById('d')!
    let closed = false
    const e = dispatchEscape(dom, ce as unknown as unknown as EventTarget)
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(false)
  })

  test('ignores non-Escape keys', () => {
    const dom = emptyDom()
    const root = makeShadowRoot(dom)
    let closed = false
    const e = new dom.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }) as unknown as KeyboardEvent
    handleEscapeKey(e, root, () => (closed = true))
    expect(closed).toBe(false)
  })
})

afterAll(() => closeAllWindows())
