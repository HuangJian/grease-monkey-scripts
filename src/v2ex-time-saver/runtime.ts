import type { Runtime } from './types'

declare const GM: {
  getValue<T>(key: string, defaultValue: T): Promise<T>
  setValue(key: string, value: string): Promise<void> | void
}

declare function GM_xmlhttpRequest(details: {
  url: string
  method: string
  timeout?: number
  onload(response: { responseText: string }): void
}): void

declare function GM_addStyle(css: string): void

export function createBrowserRuntime(): Runtime {
  return {
    document,
    location,
    DOMParser,
    prompt: window.prompt.bind(window),
    getValue: (key, defaultValue) => GM.getValue(key, defaultValue),
    setValue: (key, value) => GM.setValue(key, value),
    request: (details) => GM_xmlhttpRequest(details),
    addStyle: (css) => GM_addStyle(css),
  }
}
