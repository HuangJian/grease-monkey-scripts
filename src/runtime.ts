export type RequestDetails = {
  url: string
  method: string
  timeout?: number
  onload(response: { responseText: string; status?: number }): void
  onerror?: () => void
  ontimeout?: () => void
}

export type Runtime = {
  document: Document
  location: Location
  DOMParser: typeof DOMParser
  MutationObserver: typeof MutationObserver
  prompt(message?: string, defaultValue?: string): string | null
  getValue<T>(key: string, defaultValue: T): Promise<T>
  setValue(key: string, value: unknown): Promise<void> | void
  request(details: RequestDetails): void
  addStyle(css: string): void
}

declare const GM: {
  getValue<T>(key: string, defaultValue: T): Promise<T>
  setValue(key: string, value: unknown): Promise<void> | void
}

declare function GM_xmlhttpRequest(details: {
  url: string
  method: string
  timeout?: number
  onload(response: { responseText: string; status?: number }): void
  onerror?: () => void
  ontimeout?: () => void
}): void

declare function GM_addStyle(css: string): void

export function createBrowserRuntime(): Runtime {
  return {
    document,
    location,
    DOMParser,
    MutationObserver,
    prompt: window.prompt.bind(window),
    getValue: (key, defaultValue) => GM.getValue(key, defaultValue),
    setValue: (key, value) => GM.setValue(key, value),
    request: (details) => GM_xmlhttpRequest(details),
    addStyle: (css) => GM_addStyle(css),
  }
}
