import { afterAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createDom, createRuntime, closeAllWindows, TestRuntimeBuilder } from './runtime'

afterAll(() => closeAllWindows())

describe('TestRuntimeBuilder', () => {
  test('withStore sets stores that getValue returns', async () => {
    const runtime = new TestRuntimeBuilder().withStore('my-key', { a: 1 }).build()
    const result = await runtime.getValue<{ a: number } | undefined>('my-key', undefined)
    expect(result).toEqual({ a: 1 })
  })

  test('withStore chains multiple stores', async () => {
    const runtime = new TestRuntimeBuilder()
      .withStore('key1', 'val1')
      .withStore('key2', 'val2')
      .build()
    expect(await runtime.getValue('key1', '')).toBe('val1')
    expect(await runtime.getValue('key2', '')).toBe('val2')
  })

  test('withResponse queues responses for request', () => {
    const runtime = new TestRuntimeBuilder()
      .withResponse('https://api.test/data', '{"ok":true}')
      .build()
    let loaded = false
    runtime.request({
      url: 'https://api.test/data',
      method: 'GET',
      onload: (r) => {
        loaded = true
        expect(r.responseText).toBe('{"ok":true}')
        expect(r.status).toBe(200)
      },
    })
    expect(loaded).toBe(true)
  })

  test('withDom uses the provided DOM', () => {
    const dom = createDom('<div id="test">hello</div>')
    const runtime = new TestRuntimeBuilder().withDom(dom).build()
    const el = runtime.document.getElementById('test')
    expect(el?.textContent).toBe('hello')
  })

  test('build without any config returns a working runtime', async () => {
    const runtime = new TestRuntimeBuilder().build()
    expect(await runtime.getValue('missing', 'default')).toBe('default')
    expect(runtime.stores).toEqual({})
  })
})

describe('addStyle mock captures CSS', () => {
  test('addStyle records CSS payloads in injectedStyles', () => {
    const runtime = createRuntime()
    runtime.addStyle('.gm-test { color: red; }')
    runtime.addStyle('.gm-test2 { color: blue; }')
    expect(runtime.injectedStyles).toHaveLength(2)
    expect(runtime.injectedStyles[0]).toBe('.gm-test { color: red; }')
    expect(runtime.injectedStyles[1]).toBe('.gm-test2 { color: blue; }')
  })

  test('addStyle starts empty', () => {
    const runtime = createRuntime()
    expect(runtime.injectedStyles).toEqual([])
  })
})

describe('localStorage', () => {
  test('uses dom native localStorage when dom is provided', () => {
    const dom = createDom('<html><body></body></html>')
    const runtime = createRuntime(dom)
    runtime.localStorage.setItem('test-key', 'test-value')
    expect(runtime.localStorage.getItem('test-key')).toBe('test-value')
    expect(dom.localStorage.getItem('test-key')).toBe('test-value')
  })

  test('uses in-memory mock when no dom is provided', () => {
    const runtime = createRuntime()
    runtime.localStorage.setItem('mock-key', 'mock-value')
    expect(runtime.localStorage.getItem('mock-key')).toBe('mock-value')
    expect(runtime.localStorage.length).toBe(1)
    expect(runtime.localStorage.key(0)).toBe('mock-key')
  })

  test('mock localStorage removeItem works', () => {
    const runtime = createRuntime()
    runtime.localStorage.setItem('k1', 'v1')
    runtime.localStorage.removeItem('k1')
    expect(runtime.localStorage.getItem('k1')).toBeNull()
    expect(runtime.localStorage.length).toBe(0)
  })

  test('mock localStorage clear works', () => {
    const runtime = createRuntime()
    runtime.localStorage.setItem('k1', 'v1')
    runtime.localStorage.setItem('k2', 'v2')
    runtime.localStorage.clear()
    expect(runtime.localStorage.length).toBe(0)
  })
})

describe('CSS regression: v2ex index.css', () => {
  const cssPath = resolve(import.meta.dir, '../src/v2ex-time-saver/index.css')
  const css = readFileSync(cssPath, 'utf8')

  test('contains key v2ex feature selectors', () => {
    const expectedSelectors = [
      '.cell[id] > .cell[id]',
      'button.gm',
      '.gm.expand',
      '.gm.collapse',
      '.cell.discussions-collapsed',
      '.gm-author-tag',
      '.gm-reference-hints',
      '.gm-reference-hint',
      '.gm-reference-dialog',
      '.gm-wise-navigator',
      '.gm-wise-nav-btn',
    ]
    for (const selector of expectedSelectors) {
      expect(css).toContain(selector)
    }
  })

  test('contains score-based opacity rules', () => {
    expect(css).toContain('.gm-author--3')
    expect(css).toContain('opacity: 0.1')
    expect(css).toContain('.gm-author--2')
    expect(css).toContain('opacity: 0.3')
  })

  test('imports shared tag-panel CSS', () => {
    expect(css).toContain("@import '../shared/tag-panel/tag-panel.css'")
  })
})
