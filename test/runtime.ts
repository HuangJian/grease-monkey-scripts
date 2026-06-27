import type { Runtime, ValueChangeListener } from '../src/runtime'
import { JSDOM } from 'jsdom'
import { Window } from 'happy-dom'

// Make Preact state updates synchronous in tests
import { options as preactOptions } from 'preact'
preactOptions.debounceRendering = (fn: () => void) => fn()

// happy-dom's DOMParser can't parse XML with CDATA sections (RSS feeds).
// Provide a JSDOM-based DOMParser class for tests that parse XML.
export const XmlDOMParser = new JSDOM('').window.DOMParser as typeof DOMParser

const _windows: Window[] = []

export function createDom(html: string, url = 'https://www.v2ex.com/t/123'): Window {
  const win = new Window({ url })
  win.document.documentElement.innerHTML = html
  _windows.push(win)
  return win
}

/** Create a happy-dom Window for isolated DOM snippets (no URL). */
export function createHappyDom(html: string, url?: string): Window {
  const win = new Window({ url: url ?? 'http://localhost' })
  win.document.documentElement.innerHTML = html
  _windows.push(win)
  return win
}

/** Close all windows created during tests. Call in afterAll/afterEach. */
export function closeAllWindows(): void {
  for (const w of _windows) {
    try {
      w.close()
    } catch {
      /* ignore */
    }
  }
  _windows.length = 0
}

export type MenuCommand = { id: number; name: string; fn: () => void }

export type TestRuntime = Runtime & {
  stores: Record<string, unknown>
  listeners: Map<string, ValueChangeListener[]>
  menuCommands: MenuCommand[]
  responses: Map<string, { text: string; status: number; responseHeaders: string }>
  lastRequest: {
    url: string
    method: string
    headers?: Record<string, string>
    data?: string
  } | null
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

function createMockStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key(i: number) {
      return [...map.keys()][i] ?? null
    },
    getItem(k: string) {
      return map.get(k) ?? null
    },
    setItem(k: string, v: string) {
      map.set(k, String(v))
    },
    removeItem(k: string) {
      map.delete(k)
    },
    clear() {
      map.clear()
    },
  }
}

export function createRuntime(dom?: Window): TestRuntime {
  const doc = (dom?.document ?? globalThis.document) as Runtime['document']
  const loc = (dom?.location ?? globalThis.location) as Runtime['location']
  const DOMParserCtor = (dom?.DOMParser ?? globalThis.DOMParser) as typeof DOMParser
  const MutationObs = (dom?.MutationObserver ??
    globalThis.MutationObserver) as typeof MutationObserver
  const stores: Record<string, unknown> = {}
  const listeners: Map<string, ValueChangeListener[]> = new Map()
  const menuCommands: MenuCommand[] = []
  const responses: Map<string, { text: string; status: number; responseHeaders: string }> =
    new Map()
  let lastRequest: TestRuntime['lastRequest'] = null
  let nextId = 1
  const runtime: TestRuntime = {
    document: doc,
    location: loc,
    DOMParser: DOMParserCtor,
    MutationObserver: MutationObs,
    stores,
    listeners,
    menuCommands,
    responses,
    get lastRequest() {
      return lastRequest
    },
    prompt: () => '洞察者',
    alert: () => {},
    localStorage: dom?.localStorage ?? createMockStorage(),
    getValue: async <T>(key: string, defaultValue: T) =>
      key in stores ? (stores[key] as T) : defaultValue,
    setValue: (key, value) => {
      stores[key] = value
    },
    deleteValue: (key) => {
      delete stores[key]
    },
    listValues: async () => Object.keys(stores),
    request: (details) => {
      lastRequest = {
        url: details.url,
        method: details.method,
        headers: details.headers,
        data: details.data,
      }
      const r = responses.get(details.url)
      if (r) {
        details.onload({
          responseText: r.text,
          status: r.status,
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
    addElement: (_parentNode, _tagName, _attributes) => document.createElement(_tagName),
    pageFetch: async (url) => {
      const r = responses.get(url)
      if (!r) throw new Error(`pageFetch: no queued response for ${url}`)
      if (r.status !== 200) {
        throw new Error(
          `pageFetch HTTP ${r.status} for ${url}\n  body[:300]: ${r.text.slice(0, 300)}`,
        )
      }
      return JSON.parse(r.text)
    },
    queueResponse(url, text, status, responseHeaders) {
      responses.set(url, { text, status: status ?? 200, responseHeaders: responseHeaders ?? '' })
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
