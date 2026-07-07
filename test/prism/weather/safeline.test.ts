import { describe, expect, test } from 'bun:test'
import {
  sha1Hex,
  hasLeadingZeroBits,
  isSafelineChallenge,
  parseSafelineChallenge,
  solveSafelinePow,
  extractSafelineCookie,
  buildSafelineCookieHeader,
} from '../../../src/prism/weather/cma/safeline'

// ---------------------------------------------------------------------------
// sha1Hex
// ---------------------------------------------------------------------------

describe('sha1Hex', () => {
  // Standard SHA-1 test vectors (FIPS 180-1)
  test('empty string', () => {
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  })

  test('abc', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  test('longer message', () => {
    expect(sha1Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    )
  })

  test('million-char message', () => {
    expect(sha1Hex('a'.repeat(1_000_000))).toBe('34aa973cd4c4daa4f61eeb2bdbad27316534016f')
  })

  test('hex suffix input (as used in PoW)', () => {
    expect(sha1Hex('eszldtokzdzgzkburcru0')).toBe('1e52efacab0361e9ebab7569df524232f1254614')
  })
})

// ---------------------------------------------------------------------------
// hasLeadingZeroBits
// ---------------------------------------------------------------------------

describe('hasLeadingZeroBits', () => {
  test('8 bits = first 2 hex digits must be 00', () => {
    expect(hasLeadingZeroBits('00aabbcc', 8)).toBe(true)
    expect(hasLeadingZeroBits('01aabbcc', 8)).toBe(false)
    expect(hasLeadingZeroBits('0faabbcc', 8)).toBe(false)
  })

  test('9 bits = first 2 hex digits 00 + 3rd digit 0-7', () => {
    expect(hasLeadingZeroBits('00000000', 9)).toBe(true)
    expect(hasLeadingZeroBits('00700000', 9)).toBe(true)
    expect(hasLeadingZeroBits('00800000', 9)).toBe(false)
    expect(hasLeadingZeroBits('00f00000', 9)).toBe(false)
    expect(hasLeadingZeroBits('01000000', 9)).toBe(false)
  })

  test('4 bits = first hex digit must be 0', () => {
    expect(hasLeadingZeroBits('0abc', 4)).toBe(true)
    expect(hasLeadingZeroBits('1abc', 4)).toBe(false)
    expect(hasLeadingZeroBits('fabc', 4)).toBe(false)
  })

  test('12 bits = first 3 hex digits must be 000', () => {
    expect(hasLeadingZeroBits('000abc', 12)).toBe(true)
    expect(hasLeadingZeroBits('001abc', 12)).toBe(false)
    expect(hasLeadingZeroBits('00fabc', 12)).toBe(false)
  })

  test('0 bits always true', () => {
    expect(hasLeadingZeroBits('ffff', 0)).toBe(true)
    expect(hasLeadingZeroBits('0000', 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isSafelineChallenge
// ---------------------------------------------------------------------------

describe('isSafelineChallenge', () => {
  test('detects WAF challenge page', () => {
    expect(isSafelineChallenge('<html><title>WEB 应用防火墙</title>')).toBe(true)
    expect(isSafelineChallenge('<div id="js-challenge">')).toBe(true)
  })

  test('returns false for real data', () => {
    expect(isSafelineChallenge('{"code":0,"data":{"now":{}}}')).toBe(false)
    expect(isSafelineChallenge('<html><body>real weather</body></html>')).toBe(false)
    expect(isSafelineChallenge('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parseSafelineChallenge
// ---------------------------------------------------------------------------

const SAMPLE_CHALLENGE_HTML = `<!DOCTYPE html><html><head><title>WEB 应用防火墙</title></head>
<body><script>
var prefix = 'eszldtokzdzgzkburcru';//arg1
var leading_zero_bit = 9;//arg2
var cnt = 0;
var suffix = cnt.toString(16);
</script></body></html>`

describe('parseSafelineChallenge', () => {
  test('parses prefix and leadingZeroBits', () => {
    const result = parseSafelineChallenge(SAMPLE_CHALLENGE_HTML)
    expect(result).toEqual({
      prefix: 'eszldtokzdzgzkburcru',
      leadingZeroBits: 9,
    })
  })

  test('returns null for non-challenge HTML', () => {
    expect(parseSafelineChallenge('<html><body>not a challenge</body></html>')).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(parseSafelineChallenge('')).toBeNull()
  })

  test('returns null if leading_zero_bit is missing', () => {
    expect(parseSafelineChallenge("var prefix = 'abc';")).toBeNull()
  })

  test('returns null if prefix is missing', () => {
    expect(parseSafelineChallenge('var leading_zero_bit = 9;')).toBeNull()
  })

  test('returns null for zero or negative bits', () => {
    expect(parseSafelineChallenge("var prefix = 'abc'; var leading_zero_bit = 0;")).toBeNull()
    expect(parseSafelineChallenge("var prefix = 'abc'; var leading_zero_bit = -1;")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// solveSafelinePow
// ---------------------------------------------------------------------------

describe('solveSafelinePow', () => {
  test('finds a suffix that produces leading zero bits', () => {
    const prefix = 'testprefix'
    const bits = 8
    const suffix = solveSafelinePow(prefix, bits)
    const hash = sha1Hex(prefix + suffix)
    expect(hasLeadingZeroBits(hash, bits)).toBe(true)
  })

  test('9-bit difficulty (typical CMA value)', () => {
    const prefix = 'eszldtokzdzgzkburcru'
    const suffix = solveSafelinePow(prefix, 9)
    const hash = sha1Hex(prefix + suffix)
    expect(hasLeadingZeroBits(hash, 9)).toBe(true)
  })

  test('suffix is a valid hex string', () => {
    const suffix = solveSafelinePow('abc', 4)
    expect(suffix).toMatch(/^[0-9a-f]+$/)
  })

  test('low difficulty solves quickly', () => {
    const suffix = solveSafelinePow('quick', 4)
    // With 4 bits, ~16 iterations on average, suffix should be small
    const cnt = parseInt(suffix, 16)
    expect(cnt).toBeLessThan(100)
  })
})

// ---------------------------------------------------------------------------
// extractSafelineCookie
// ---------------------------------------------------------------------------

describe('extractSafelineCookie', () => {
  test('extracts cookie from Set-Cookie header', () => {
    const headers = [
      'HTTP/1.1 200 OK',
      'Content-Type: text/html',
      'Set-Cookie: safeline_bot_challenge=AQAAAABwIDUAPTq; SameSite=Lax; Max-Age=60',
      'Set-Cookie: safeline_bot_token=0; SameSite=Lax; Max-Age=0',
    ].join('\r\n')

    expect(extractSafelineCookie(headers)).toBe('AQAAAABwIDUAPTq')
  })

  test('handles single header line', () => {
    expect(extractSafelineCookie('Set-Cookie: safeline_bot_challenge=abc123; Max-Age=60')).toBe(
      'abc123',
    )
  })

  test('returns null when cookie is absent', () => {
    expect(extractSafelineCookie('Content-Type: text/html\r\nSet-Cookie: other=123')).toBeNull()
  })

  test('returns null for empty headers', () => {
    expect(extractSafelineCookie('')).toBeNull()
  })

  test('case-insensitive header name', () => {
    expect(extractSafelineCookie('set-cookie: safeline_bot_challenge=xyz; Max-Age=60')).toBe('xyz')
  })

  test('handles \n line endings (no \r)', () => {
    const headers =
      'Content-Type: text/html\nSet-Cookie: safeline_bot_challenge=token123; Max-Age=60\n'
    expect(extractSafelineCookie(headers)).toBe('token123')
  })
})

// ---------------------------------------------------------------------------
// buildSafelineCookieHeader
// ---------------------------------------------------------------------------

describe('buildSafelineCookieHeader', () => {
  test('builds correct Cookie header', () => {
    const cookie = 'AQAAAABwIDUAPTq'
    const suffix = '9a'
    const result = buildSafelineCookieHeader(cookie, suffix)
    expect(result).toBe(
      'safeline_bot_challenge=AQAAAABwIDUAPTq; safeline_bot_challenge_ans=AQAAAABwIDUAPTq9a',
    )
  })

  test('answer is token + suffix concatenated', () => {
    const cookie = 'abc'
    const suffix = 'ff'
    const result = buildSafelineCookieHeader(cookie, suffix)
    expect(result).toContain('safeline_bot_challenge_ans=abcff')
  })
})
