import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { mountOverlay, getMountedRoot } from '../../src/dashboard/overlay/mount'
import { createRuntime, type TestRuntime } from '../runtime'

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><head></head><body></body></html>')
}

describe('mountOverlay', () => {
  let dom: JSDOM
  let runtime: TestRuntime

  beforeEach(() => {
    dom = makeDom()
    runtime = createRuntime(dom)
  })

  afterEach(() => {
    dom.window.document.body.innerHTML = ''
  })

  test('appends host to document.body (not documentElement)', () => {
    const handle = mountOverlay(dom.window.document)
    const host = dom.window.document.getElementById('gm-dashboard') as HTMLElement
    expect(host).not.toBeNull()
    expect(host.parentElement).toBe(dom.window.document.body)
    expect(handle.root).toBe(getMountedRoot(host)!)
  })

  test('uses closed shadow root (host.shadowRoot is null)', () => {
    const handle = mountOverlay(dom.window.document)
    const host = dom.window.document.getElementById('gm-dashboard') as HTMLElement
    expect(host.shadowRoot).toBeNull()
    expect(handle.root).not.toBeNull()
  })

  test('exposes backdrop, modal, cards via the root', () => {
    const handle = mountOverlay(dom.window.document)
    expect(handle.root.querySelector('.gm-sp-backdrop')).toBe(handle.backdrop)
    expect(handle.root.querySelector('.gm-sp-modal')).toBe(handle.modal)
    expect(handle.root.querySelector('.gm-sp-cards')).toBe(handle.cards)
  })

  test('injects <style> node with overlay css', () => {
    const handle = mountOverlay(dom.window.document)
    const style = handle.root.querySelector('style')
    expect(style).not.toBeNull()
    expect((style as HTMLStyleElement).textContent.length).toBeGreaterThan(0)
  })

  test('unmount removes host from document.body', () => {
    const handle = mountOverlay(dom.window.document)
    handle.unmount()
    expect(dom.window.document.getElementById('gm-dashboard')).toBeNull()
  })

  test('mounting twice produces two independent roots', () => {
    const a = mountOverlay(dom.window.document)
    const b = mountOverlay(dom.window.document)
    expect(a.root).not.toBe(b.root)
    a.unmount()
    expect(b.root.querySelector('.gm-sp-backdrop')).not.toBeNull()
    b.unmount()
  })

  test('runtime mock document still works through runtime.document', () => {
    mountOverlay(dom.window.document)
    expect(runtime.document.body.children.length).toBe(1)
  })
})
