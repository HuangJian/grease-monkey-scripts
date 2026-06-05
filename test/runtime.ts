import { JSDOM } from 'jsdom'
import type { Runtime, ValueChangeListener } from '../src/runtime'

export function createDom(html: string, url = 'https://www.v2ex.com/t/123'): JSDOM {
  return new JSDOM(html, { url })
}

export type MenuCommand = { id: number; name: string; fn: () => void }

export type TestRuntime = Runtime & {
  stores: Record<string, unknown>
  listeners: Map<string, ValueChangeListener[]>
  menuCommands: MenuCommand[]
  responses: Map<string, { text: string; status?: number; responseHeaders?: string }>
  lastRequest: { url: string; method: string; headers?: Record<string, string> } | null
  queueResponse(url: string, text: string, status?: number, responseHeaders?: string): void
  simulateRemoteChange(key: string, newValue: unknown): void
  runMenuCommand(name: string): boolean
}

if (
  typeof globalThis.crypto === 'undefined' ||
  typeof globalThis.crypto.randomUUID !== 'function'
) {
  ;(globalThis as { crypto?: { randomUUID(): string } }).crypto = {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2),
  }
}

export function createRuntime(dom: JSDOM): TestRuntime {
  const stores: Record<string, unknown> = {}
  const listeners: Map<string, ValueChangeListener[]> = new Map()
  const menuCommands: MenuCommand[] = []
  const responses: Map<string, { text: string; status?: number; responseHeaders?: string }> =
    new Map()
  let lastRequest: TestRuntime['lastRequest'] = null
  let nextId = 1
  const runtime: TestRuntime = {
    document: dom.window.document,
    location: dom.window.location,
    DOMParser: dom.window.DOMParser,
    MutationObserver: dom.window.MutationObserver,
    stores,
    listeners,
    menuCommands,
    responses,
    get lastRequest() {
      return lastRequest
    },
    prompt: () => '洞察者',
    getValue: async <T>(key: string, defaultValue: T) =>
      key in stores ? (stores[key] as T) : defaultValue,
    setValue: (key, value) => {
      stores[key] = value
    },
    request: (details) => {
      lastRequest = {
        url: details.url,
        method: details.method,
        headers: details.headers,
      }
      const r = responses.get(details.url)
      if (r) {
        details.onload({
          responseText: r.text,
          status: r.status ?? 200,
          responseHeaders: r.responseHeaders,
        })
      } else {
        details.onerror?.()
      }
    },
    addStyle: () => {},
    addEventListener: (target, type, listener, options) => {
      const et = target as EventTarget
      if (et && typeof et.addEventListener === 'function') {
        et.addEventListener(type, listener as EventListener, options)
      }
    },
    addValueChangeListener: (key, listener) => {
      const arr = listeners.get(key) ?? []
      arr.push(listener)
      listeners.set(key, arr)
      return nextId++
    },
    requestIdleCallback: (cb) => {
      cb()
    },
    registerMenuCommand: (name, fn) => {
      const id = nextId++
      menuCommands.push({ id, name, fn })
      return id
    },
    queueResponse(url, text, status, responseHeaders) {
      responses.set(url, { text, status, responseHeaders })
    },
    simulateRemoteChange(key, newValue) {
      const oldValue = stores[key]
      stores[key] = newValue
      const ls = listeners.get(key)
      if (ls) {
        for (const l of ls) l(key, oldValue, newValue, true)
      }
    },
    runMenuCommand(name) {
      const cmd = menuCommands.find((c) => c.name === name)
      if (!cmd) return false
      cmd.fn()
      return true
    },
  }
  return runtime
}
