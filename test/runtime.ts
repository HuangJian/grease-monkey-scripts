import { JSDOM } from 'jsdom'
import type { Runtime } from '../src/runtime'

export function createDom(html: string, url = 'https://www.v2ex.com/t/123'): JSDOM {
  return new JSDOM(html, { url })
}

export function createRuntime(dom: JSDOM): Runtime {
  return {
    document: dom.window.document,
    location: dom.window.location,
    DOMParser: dom.window.DOMParser,
    MutationObserver: dom.window.MutationObserver,
    prompt: () => '洞察者',
    getValue: async <T>(_key: string, defaultValue: T) => defaultValue,
    setValue: () => {},
    request: () => {},
    addStyle: () => {},
  }
}
