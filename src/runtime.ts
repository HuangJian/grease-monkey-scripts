export type RequestDetails = {
  url: string
  method: string
  timeout?: number
  anonymous?: boolean
  headers?: Record<string, string>
  data?: string
  onload(response: { responseText: string; status: number; responseHeaders: string }): void
  onerror?: () => void
  ontimeout?: () => void
}

export type ValueChangeListener = (
  key: string,
  oldValue: unknown,
  newValue: unknown,
  remote: boolean,
) => void

export type AddEventListenerOptions = {
  capture?: boolean
  once?: boolean
  passive?: boolean
}

export type Runtime = {
  document: Document
  location: Location
  DOMParser: typeof DOMParser
  MutationObserver: typeof MutationObserver
  prompt(message?: string, defaultValue?: string): string | null
  alert(message?: string): void
  localStorage: Storage
  getValue<T>(key: string, defaultValue: T): Promise<T>
  setValue(key: string, value: unknown): Promise<void> | void
  deleteValue(key: string): Promise<void> | void
  listValues(): Promise<string[]>
  request(details: RequestDetails): void
  addStyle(css: string): void
  addEventListener(
    target: EventTarget,
    type: string,
    listener: (e: Event) => void,
    options?: AddEventListenerOptions,
  ): void
  addValueChangeListener(key: string, listener: ValueChangeListener): number
  addElement(parentNode: Element, tagName: string, attributes: Record<string, string>): HTMLElement
  requestIdleCallback(cb: () => void, options?: { timeout: number }): void
  registerMenuCommand(name: string, fn: () => void): number
}

declare const GM: {
  getValue<T>(key: string, defaultValue: T): Promise<T>
  setValue(key: string, value: unknown): Promise<void> | void
  deleteValue(key: string): Promise<void> | void
  listValues(): Promise<string[]>
}

declare function GM_xmlhttpRequest(details: {
  url: string
  method: string
  timeout?: number
  anonymous?: boolean
  headers?: Record<string, string>
  onload(response: { responseText: string; status: number; responseHeaders: string }): void
  onerror?: () => void
  ontimeout?: () => void
}): void

declare function GM_addStyle(css: string): void

declare function GM_addElement(
  parentNode: Element,
  tagName: string,
  attributes: Record<string, string>,
): HTMLElement

declare function GM_addValueChangeListener(
  name: string,
  callback: (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
): number

declare function GM_registerMenuCommand(name: string, fn: () => void): number

export function createBrowserRuntime(): Runtime {
  return {
    document,
    location,
    DOMParser,
    MutationObserver,
    prompt: window.prompt.bind(window),
    alert: window.alert.bind(window),
    localStorage,
    getValue: (key, defaultValue) => GM.getValue(key, defaultValue),
    setValue: (key, value) => GM.setValue(key, value),
    deleteValue: (key) => GM.deleteValue(key),
    listValues: () => GM.listValues(),
    request: (details) => GM_xmlhttpRequest(details),
    addStyle: (css) => GM_addStyle(css),
    addEventListener: (target, type, listener, options) => {
      target.addEventListener(type, listener as EventListener, options)
    },
    addValueChangeListener: (key, listener) => GM_addValueChangeListener(key, listener),
    requestIdleCallback: (cb, options) => {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void
      }
      if (typeof w.requestIdleCallback === 'function') {
        w.requestIdleCallback(cb, options)
      } else {
        setTimeout(cb, options?.timeout ?? 0)
      }
    },
    registerMenuCommand: (name, fn) => GM_registerMenuCommand(name, fn),
    addElement: (parentNode, tagName, attributes) => GM_addElement(parentNode, tagName, attributes),
  }
}
