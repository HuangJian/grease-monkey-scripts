import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'bun:test'
import { buildZdicUrl } from '../../src/hanzi-dictionary/app/zdic'

function parseFixture(html: string) {
  return new globalThis.DOMParser().parseFromString(html, 'text/html')
}

const yaoFixture = readFileSync(resolve(import.meta.dir, 'zdic-yao.html'), 'utf8')
const shaFixture = readFileSync(resolve(import.meta.dir, 'zdic-sha.html'), 'utf8')

describe('zdic parsing', () => {
  it('parses gy-reading__head (单音字: 耀)', () => {
    const doc = parseFixture(yaoFixture)

    const reading = doc.querySelector('.gy-reading__head')
    expect(reading).not.toBeNull()

    expect(reading!.querySelector('.gy-reading__char')?.textContent?.trim()).toBe('耀')
    expect(reading!.querySelector('.gy-reading__py')?.textContent?.trim()).toBe('yào')
    expect(reading!.querySelector('.gy-reading__zy')?.textContent?.trim()).toBe('ㄧㄠˋ')

    const defs = Array.from(doc.querySelectorAll('.gy-sense__def')).map((el) =>
      el.textContent?.trim(),
    )
    expect(defs).toEqual(['光辉、光彩。', '古同「耀」，显扬；炫耀。'])
  })

  it('parses jbjs-reading__head (多音字: 厦)', () => {
    const doc = parseFixture(shaFixture)

    const reading = doc.querySelector('.jbjs-reading__head')
    expect(reading).not.toBeNull()

    expect(reading!.querySelector('[class*="char"]')?.textContent?.trim()).toContain('厦')
    expect(reading!.querySelector('[class*="py"]')?.textContent?.trim()).toBe('shà')
    expect(reading!.querySelector('[class*="zy"]')?.textContent?.trim()).toBe('ㄕㄚˋ')

    const defs = Array.from(doc.querySelectorAll('.jbjs-item__def')).map((el) =>
      el.textContent?.trim(),
    )
    expect(defs).toEqual(['大屋子。', '（Xià）地名，厦门。'])
  })

  it('buildUrl does not double-encode', () => {
    expect(buildZdicUrl('耀')).toBe('https://www.zdic.net/hans/耀')
    expect(buildZdicUrl('链接')).toBe('https://www.zdic.net/hans/链接')
  })
})
