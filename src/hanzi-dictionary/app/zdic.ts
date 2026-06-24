import type { Runtime } from '../../runtime'

export interface ZdicResult {
  word: string
  pinyin: string
  zhuyin: string
  definitions: string[]
}

export interface ZdicError {
  word: string
  url: string
}

export function buildZdicUrl(word: string): string {
  return `https://www.zdic.net/hans/${word.trim()}`
}

const READING_SELECTORS = ['.gy-reading__head', '.jbjs-reading__head', '.xxjs-reading__head']
const DEF_SELECTORS = ['.gy-sense__def', '.jbjs-item__def', '.xxjs-item__def']

export function queryZdic(
  runtime: Runtime,
  word: string,
): Promise<{ ok: true; result: ZdicResult } | { ok: false; error: ZdicError }> {
  const trimmed = word.trim()
  const url = buildZdicUrl(trimmed)

  return new Promise((resolve) => {
    runtime.request({
      url,
      method: 'GET',
      timeout: 10000,
      onload(response) {
        if (response.status && (response.status < 200 || response.status >= 300)) {
          resolve({ ok: false, error: { word: trimmed, url } })
          return
        }
        try {
          const parser = new runtime.DOMParser()
          const doc = parser.parseFromString(response.responseText ?? '', 'text/html')

          let reading: Element | null = null
          for (const sel of READING_SELECTORS) {
            reading = doc.querySelector(sel)
            if (reading) break
          }
          if (!reading) {
            resolve({ ok: false, error: { word: trimmed, url } })
            return
          }

          const charEl = reading.querySelector('[class*="char"]')
          const pyEl = reading.querySelector('[class*="py"]')
          const zyEl = reading.querySelector('[class*="zy"]')

          let definitions: string[] = []
          for (const sel of DEF_SELECTORS) {
            const els = doc.querySelectorAll(sel)
            if (els.length > 0) {
              definitions = Array.from(els).map((el) => el.textContent?.trim() ?? '')
              break
            }
          }

          resolve({
            ok: true,
            result: {
              word: charEl?.textContent?.trim() ?? trimmed,
              pinyin: pyEl?.textContent?.trim() ?? '',
              zhuyin: zyEl?.textContent?.trim() ?? '',
              definitions,
            },
          })
        } catch {
          resolve({ ok: false, error: { word: trimmed, url } })
        }
      },
      onerror() {
        resolve({ ok: false, error: { word: trimmed, url } })
      },
      ontimeout() {
        resolve({ ok: false, error: { word: trimmed, url } })
      },
    })
  })
}
