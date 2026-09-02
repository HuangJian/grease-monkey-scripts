import { describe, expect, test } from 'bun:test'
import { sanitizeHtml } from '../../../src/prism/shared/sanitize'
import { XmlDOMParser } from '../../runtime'

const parser = new XmlDOMParser()

describe('sanitizeHtml', () => {
  test('strips script/style/iframe/object/embed', () => {
    const out = sanitizeHtml(
      '<p>ok</p><script>alert(1)</script><style>p{}</style><iframe src="x"></iframe>',
      parser,
    )
    expect(out).not.toContain('script')
    expect(out).not.toContain('style')
    expect(out).not.toContain('iframe')
    expect(out).toContain('<p>ok</p>')
  })

  test('blocks on* handlers and style', () => {
    const out = sanitizeHtml('<p onclick="alert(1)" style="color:red">x</p>', parser)
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('style=')
    expect(out).toContain('x')
  })

  test('strips javascript: href even when entity-encoded', () => {
    const out = sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>', parser)
    expect(out).not.toContain('href')
    expect(out).toContain('x')
  })

  test('strips data:text/html href', () => {
    const out = sanitizeHtml('<a href="data:text/html,<h1>x</h1>">x</a>', parser)
    expect(out).not.toContain('href')
  })

  test('forces rel/sanitizes html link targets', () => {
    const out = sanitizeHtml('<a href="https://x">link</a>', parser)
    expect(out).toContain('href="https://x"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  test('unwrap unknown tags but keeps their text', () => {
    const out = sanitizeHtml('<weird><span>kept</span></weird>', parser)
    expect(out).not.toContain('weird')
    expect(out).toContain('kept')
  })

  test('blocks base/form/svg tags', () => {
    const out = sanitizeHtml('<base href="https://evil">hello<form>f</form><svg></svg>', parser)
    expect(out).not.toContain('base')
    expect(out).not.toContain('form')
    expect(out).not.toContain('svg')
    expect(out).toContain('hello')
  })

  test('handles a long gut of < without pathological input (no crash)', () => {
    const input = '<p>' + '<'.repeat(80) + '</p>'
    const out = sanitizeHtml(input, parser)
    expect(typeof out).toBe('string')
  })

  test('wrapImagesInAnchor: false keeps img inline', () => {
    const out = sanitizeHtml('<img src="https://x/a.jpg"/>', parser, { wrapImagesInAnchor: false })
    expect(out).toContain('<img')
    expect(out).not.toContain('<a')
  })

  test('wrapImagesInAnchor: true wraps free img in anchor', () => {
    const out = sanitizeHtml('<img src="https://x/a.jpg"/>', parser, { wrapImagesInAnchor: true })
    expect(out).toContain('<a')
    expect(out).toContain('<img')
  })
})
