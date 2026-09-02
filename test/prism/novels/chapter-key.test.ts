import { describe, expect, test } from 'bun:test'
import {
  chapterKey,
  chapterNumber,
  normalizeTitle,
  parseChineseNumeral,
} from '../../../src/prism/novels/chapter-key'

describe('parseChineseNumeral', () => {
  test('digits and tens', () => {
    expect(parseChineseNumeral('一')).toBe(1)
    expect(parseChineseNumeral('九')).toBe(9)
    expect(parseChineseNumeral('十')).toBe(10)
    expect(parseChineseNumeral('十五')).toBe(15)
    expect(parseChineseNumeral('二十三')).toBe(23)
  })

  test('hundreds, thousands and zeros', () => {
    expect(parseChineseNumeral('一百')).toBe(100)
    expect(parseChineseNumeral('一百零五')).toBe(105)
    expect(parseChineseNumeral('一百二十三')).toBe(123)
    expect(parseChineseNumeral('一千二百三十四')).toBe(1234)
    expect(parseChineseNumeral('两百')).toBe(200)
  })

  test('unsupported input yields undefined', () => {
    expect(parseChineseNumeral('')).toBeUndefined()
    expect(parseChineseNumeral('零')).toBeUndefined()
    expect(parseChineseNumeral('三万')).toBeUndefined()
    expect(parseChineseNumeral('abc')).toBeUndefined()
  })
})

describe('chapterNumber', () => {
  test('arabic chapter markers', () => {
    expect(chapterNumber('第123章 决战')).toBe(123)
    expect(chapterNumber('第123章')).toBe(123)
    expect(chapterNumber('第1话 序')).toBe(1)
    expect(chapterNumber('第 12 章 风雨')).toBe(12)
    expect(chapterNumber('第123节')).toBe(123)
  })

  test('full-width digits are normalized', () => {
    expect(chapterNumber('第１２０章')).toBe(120)
  })

  test('chinese numerals', () => {
    expect(chapterNumber('第一章')).toBe(1)
    expect(chapterNumber('第一百二十三章 决战')).toBe(123)
    expect(chapterNumber('第两百章')).toBe(200)
  })

  test('bare leading ordinals', () => {
    expect(chapterNumber('123. 决战')).toBe(123)
    expect(chapterNumber('123、决战')).toBe(123)
    expect(chapterNumber('123 决战')).toBe(123)
    expect(chapterNumber('123:决战')).toBe(123)
  })

  test('titles without a chapter number', () => {
    expect(chapterNumber('序章')).toBeUndefined()
    expect(chapterNumber('决战紫禁之巅')).toBeUndefined()
    expect(chapterNumber('')).toBeUndefined()
    expect(chapterNumber('2024年回顾')).toBeUndefined()
  })

  test('volume markers are not chapter numbers', () => {
    expect(chapterNumber('第1卷 少年')).toBeUndefined()
  })
})

describe('normalizeTitle', () => {
  test('strips whitespace, punctuation and case', () => {
    expect(normalizeTitle(' 决战（上） ')).toBe('决战上')
    expect(normalizeTitle('Chapter-One')).toBe('chapterone')
    expect(normalizeTitle('第 一 章')).toBe('第一章')
  })

  test('full-width characters are folded', () => {
    expect(normalizeTitle('ＡＢＣ　１２３')).toBe('abc123')
  })
})

describe('chapterKey', () => {
  test('numbered titles key on the number', () => {
    expect(chapterKey('第118章 夜奔')).toBe('n:118')
    expect(chapterKey('第118章 夜奔（修订）')).toBe('n:118')
  })

  test('same chapter, different notations, same key', () => {
    expect(chapterKey('第118章 夜奔')).toBe(chapterKey('第一百一十八章 夜奔'))
    expect(chapterKey('第118章 夜奔')).toBe(chapterKey('118. 夜奔'))
  })

  test('unnumbered titles fall back to the normalized title', () => {
    expect(chapterKey('序章 夜奔')).toBe('t:序章夜奔')
    expect(chapterKey('序章  夜奔')).toBe(chapterKey('序章夜奔'))
  })

  test('number and title namespaces never collide', () => {
    expect(chapterKey('第1章')).not.toBe(chapterKey('1'))
  })
})
