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
  let nextId = 1
  const runtime: TestRuntime = {
    document: dom.window.document,
    location: dom.window.location,
    DOMParser: dom.window.DOMParser,
    MutationObserver: dom.window.MutationObserver,
    stores,
    listeners,
    menuCommands,
    prompt: () => '洞察者',
    getValue: async <T>(key: string, defaultValue: T) =>
      key in stores ? (stores[key] as T) : defaultValue,
    setValue: (key, value) => {
      stores[key] = value
    },
    request: () => {},
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
