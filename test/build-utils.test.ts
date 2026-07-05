import { describe, expect, test } from 'bun:test'

import {
  buildDashboardCssReplacement,
  buildSimpleCssInjection,
  computeHash,
  escapeForTemplateLiteral,
  parseBuildHash,
  parseCssVariables,
  postSwcOptimize,
  resolveVarReferences,
  stripJsxDevArgs,
} from '../scripts/build-utils'

// ---------------------------------------------------------------------------
// CSS variable parsing & resolution
// ---------------------------------------------------------------------------

describe('parseCssVariables', () => {
  test('parses simple custom properties', () => {
    const css = ':root{--color:red;--size:12px;}'
    const vars = parseCssVariables(css)
    expect(vars.get('--color')).toBe('red')
    expect(vars.get('--size')).toBe('12px')
  })

  test('returns empty map for CSS without variables', () => {
    const vars = parseCssVariables('.btn{color:red}')
    expect(vars.size).toBe(0)
  })

  test('handles multi-word values', () => {
    const css = '--shadow: 0 2px 4px rgba(0,0,0,0.1);'
    const vars = parseCssVariables(css)
    expect(vars.get('--shadow')).toBe('0 2px 4px rgba(0,0,0,0.1)')
  })
})

describe('resolveVarReferences', () => {
  test('replaces var() with resolved values', () => {
    const vars = new Map([
      ['--color', 'red'],
      ['--size', '12px'],
    ])
    const css = '.btn{color:var(--color);font-size:var(--size)}'
    expect(resolveVarReferences(css, vars)).toBe('.btn{color:red;font-size:12px}')
  })

  test('leaves unresolved var() intact', () => {
    const vars = new Map([['--color', 'red']])
    const css = '.btn{color:var(--color);border:var(--unknown)}'
    expect(resolveVarReferences(css, vars)).toBe('.btn{color:red;border:var(--unknown)}')
  })

  test('resolves nested references up to max depth', () => {
    const vars = new Map([
      ['--aa', 'var(--bb)'],
      ['--bb', 'var(--cc)'],
      ['--cc', 'final'],
    ])
    expect(resolveVarReferences('var(--aa)', vars)).toBe('final')
  })
})

// ---------------------------------------------------------------------------
// Template literal escaping
// ---------------------------------------------------------------------------

describe('escapeForTemplateLiteral', () => {
  test('escapes backticks', () => {
    expect(escapeForTemplateLiteral('font-family: `mono`')).toBe('font-family: \\`mono\\`')
  })

  test('escapes dollar signs', () => {
    expect(escapeForTemplateLiteral('content: $var')).toBe('content: \\$var')
  })

  test('escapes backslashes', () => {
    expect(escapeForTemplateLiteral('content: \\A')).toBe('content: \\\\A')
  })

  test('handles combined special characters', () => {
    expect(escapeForTemplateLiteral('`$\\')).toBe('\\`\\$\\\\')
  })

  test('leaves plain CSS unchanged', () => {
    const css = '.btn{color:red;font-size:12px}'
    expect(escapeForTemplateLiteral(css)).toBe(css)
  })
})

// ---------------------------------------------------------------------------
// CSS injection (the bug fix)
// ---------------------------------------------------------------------------

describe('buildSimpleCssInjection', () => {
  test('wraps raw CSS in GM_addStyle with template literal', () => {
    const css = '.btn{color:red}'
    const result = buildSimpleCssInjection(css)
    expect(result).toBe('GM_addStyle(`.btn{color:red}`)')
  })

  test('escapes special characters in CSS', () => {
    const css = '.btn{content:`$`}'
    const result = buildSimpleCssInjection(css)
    expect(result).toBe('GM_addStyle(`.btn{content:\\`\\$\\`}`)')
  })

  test('bugfix: does NOT compress CSS with LZ-string by default', () => {
    // Before the fix, prod builds injected LZ-string compressed CSS into
    // GM_addStyle() without decompression — producing gibberish, not valid CSS.
    // After the fix, the raw (already minified) CSS is injected directly.
    const css = '.gm-tag-btn{cursor:pointer}'
    const result = buildSimpleCssInjection(css)
    expect(result).toContain('.gm-tag-btn')
    expect(result).toContain('cursor:pointer')
    // Should NOT contain LZ-string compressed output (high Unicode chars)
    expect(result).not.toMatch(/[\u0E80-\u0EFF]/)
  })

  test('compresses CSS with LZ-string when useLzCompression is true', () => {
    const css = '.btn{color:red}'
    const result = buildSimpleCssInjection(css, true)
    expect(result).toContain('LZString.decompressFromUTF16(')
    // The CSS should be compressed (not raw)
    expect(result).not.toContain('.btn{color:red}')
  })
})

describe('buildDashboardCssReplacement', () => {
  test('debug mode: raw CSS in export', () => {
    const css = '.btn{color:red}'
    const result = buildDashboardCssReplacement(css, true, true)
    expect(result).toBe('export const CSS_TO_BE_INJECTED = `.btn{color:red}`')
  })

  test('prod mode with lz-string: compressed CSS with LZString.decompressFromUTF16', () => {
    const css = '.btn{color:red}'
    const result = buildDashboardCssReplacement(css, false, true)
    expect(result).toContain('LZString.decompressFromUTF16(')
    // The CSS should be compressed (not raw)
    expect(result).not.toContain('.btn{color:red}')
  })

  test('prod mode without lz-string: raw CSS in export', () => {
    const css = '.btn{color:red}'
    const result = buildDashboardCssReplacement(css, false, false)
    expect(result).toBe('export const CSS_TO_BE_INJECTED = `.btn{color:red}`')
  })

  test('debug mode without lz-string: raw CSS in export', () => {
    const css = '.btn{color:red}'
    const result = buildDashboardCssReplacement(css, true, false)
    expect(result).toBe('export const CSS_TO_BE_INJECTED = `.btn{color:red}`')
  })
})

// ---------------------------------------------------------------------------
// Post-SWC optimizations
// ---------------------------------------------------------------------------

describe('stripJsxDevArgs', () => {
  test('strips dev-only JSX trailing args', () => {
    const code = 'jsx("div",{children:"hi"},void 0,0,void 0,this)'
    expect(stripJsxDevArgs(code)).toBe('jsx("div",{children:"hi"})')
  })

  test('strips !0 flags variant', () => {
    const code = 'jsx("div",{},void 0,!0,void 0,this)'
    expect(stripJsxDevArgs(code)).toBe('jsx("div",{})')
  })

  test('preserves non-JSX void 0', () => {
    expect(stripJsxDevArgs('var x=void 0')).toBe('var x=void 0')
  })
})

describe('postSwcOptimize', () => {
  test('replaces void 0 with 0[0]', () => {
    expect(postSwcOptimize('var x=void 0')).toBe('var x=0[0]')
  })

  test('converts simple wrapper function to arrow', () => {
    const code = 'function foo(a,b){return bar(a,b)}'
    expect(postSwcOptimize(code)).toBe('let foo=(a,b)=>bar(a,b);')
  })

  test('converts async wrapper function', () => {
    const code = 'async function fetch(){return load()}'
    expect(postSwcOptimize(code)).toBe('let fetch=async()=>load();')
  })

  test('does not convert functions with multiple statements', () => {
    const code = 'function foo(a){console.log(a);return bar(a)}'
    expect(postSwcOptimize(code)).toBe(code)
  })
})

// ---------------------------------------------------------------------------
// Hash utilities
// ---------------------------------------------------------------------------

describe('computeHash', () => {
  test('returns 8-char hex string', () => {
    const hash = computeHash('hello')
    expect(hash).toMatch(/^[a-f0-9]{8}$/)
  })

  test('is deterministic for same input', () => {
    expect(computeHash('test content')).toBe(computeHash('test content'))
  })

  test('differs for different input', () => {
    expect(computeHash('a')).not.toBe(computeHash('b'))
  })
})

describe('parseBuildHash', () => {
  test('parses hash from last line', () => {
    const content = "// some code\nconsole.debug('reddit-time-saver:build abcdef12')"
    expect(parseBuildHash(content)).toBe('abcdef12')
  })

  test('parses hash from debug build with console.debug line', () => {
    const content = "// some code\nconsole.debug('reddit-time-saver:build abcdef12')"
    expect(parseBuildHash(content)).toBe('abcdef12')
  })

  test('returns null for missing build line', () => {
    expect(parseBuildHash('// some code')).toBeNull()
  })

  test('returns null for malformed hash', () => {
    expect(parseBuildHash('// build xyz')).toBeNull()
  })

  test('handles trailing whitespace', () => {
    expect(parseBuildHash("// code\nconsole.debug('reddit-time-saver:build aabbccdd')  \n")).toBe(
      'aabbccdd',
    )
  })
})
