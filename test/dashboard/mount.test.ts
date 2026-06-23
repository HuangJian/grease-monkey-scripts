import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mountOverlay, getMountedRoot } from '../../src/dashboard/shell/mount'
import { createRuntime, type TestRuntime } from '../runtime'

describe('mountOverlay', () => {
  let runtime: TestRuntime

  beforeEach(() => {
    runtime = createRuntime()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('appends host to document.body (not documentElement)', () => {
    const handle = mountOverlay(document, runtime)
    const host = document.getElementById('gm-dashboard') as HTMLElement
    expect(host).not.toBeNull()
    expect(host.parentElement).toBe(document.body)
    expect(handle.root).toBe(getMountedRoot(host)!)
  })

  test('uses closed shadow root (host.shadowRoot is null)', () => {
    const handle = mountOverlay(document, runtime)
    const host = document.getElementById('gm-dashboard') as HTMLElement
    expect(host.shadowRoot).toBeNull()
    expect(handle.root).not.toBeNull()
  })

  test('exposes backdrop, modal, mainCards, sideCards via the root', () => {
    const handle = mountOverlay(document, runtime)
    expect(handle.root.querySelector('.gm-sp-backdrop')).toBe(handle.backdrop)
    expect(handle.root.querySelector('.gm-sp-modal')).toBe(handle.modal)
    expect(handle.root.querySelector('.gm-sp-cards-main')).toBe(handle.mainCards)
    expect(handle.root.querySelector('.gm-sp-cards-side')).toBe(handle.sideCards)
  })

  test('injects <style> node with overlay css', () => {
    const handle = mountOverlay(document, runtime)
    const style = handle.root.querySelector('style')
    expect(style).not.toBeNull()
    expect((style as HTMLStyleElement).textContent.length).toBeGreaterThan(0)
  })

  test('unmount removes host from document.body', () => {
    const handle = mountOverlay(document, runtime)
    handle.unmount()
    expect(document.getElementById('gm-dashboard')).toBeNull()
  })

  test('mounting twice produces two independent roots', () => {
    const a = mountOverlay(document, runtime)
    const b = mountOverlay(document, runtime)
    expect(a.root).not.toBe(b.root)
    a.unmount()
    expect(b.root.querySelector('.gm-sp-backdrop')).not.toBeNull()
    b.unmount()
  })

  test('runtime mock document still works through runtime.document', () => {
    mountOverlay(document, runtime)
    expect(runtime.document.body.children.length).toBe(1)
  })
})
