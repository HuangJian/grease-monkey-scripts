/**
 * SafeLine WAF challenge solver.
 *
 * CMA's website (weather.cma.cn) is protected by SafeLine WAF, which issues
 * a JavaScript proof-of-work challenge instead of real data. The challenge
 * requires finding a hex suffix such that SHA1(prefix + suffix) has N leading
 * zero bits.
 *
 * Challenge flow:
 * 1. Initial request → server returns challenge HTML + Set-Cookie: safeline_bot_challenge=<token>
 * 2. Parse `prefix` and `leadingZeroBits` from the challenge HTML
 * 3. Solve PoW: find suffix (hex counter) so SHA1(prefix + suffix) starts with N zero bits
 * 4. Retry with Cookie: safeline_bot_challenge=<token>; safeline_bot_challenge_ans=<token><suffix>
 *
 * All functions here are pure (no Runtime dependency) for easy unit testing.
 */

// ---------------------------------------------------------------------------
// SHA-1 (synchronous, ASCII input)
// ---------------------------------------------------------------------------

/**
 * Rotate a 32-bit integer left by n bits.
 * Uses `| 0` to keep the result as a 32-bit signed integer (bit pattern is
 * the same as unsigned; we convert with `>>> 0` only at hex output time).
 */
function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n)) | 0
}

/**
 * Synchronous SHA-1, returning a 40-char hex string.
 *
 * Input is always short ASCII (prefix ~20 chars + hex suffix ~4 chars), so
 * the 32-bit length field is safe. This mirrors the WAF's own implementation
 * (chrsz=8, each char = 1 byte).
 */
export function sha1Hex(input: string): string {
  // Convert string to byte array (ASCII — prefix and suffix are always < 128)
  const msg: number[] = []
  for (let i = 0; i < input.length; i++) {
    msg.push(input.charCodeAt(i) & 0xff)
  }
  const originalBitLen = msg.length * 8

  // Pad: 0x80, then zeros until length ≡ 56 (mod 64), then 8-byte big-endian length
  msg.push(0x80)
  while (msg.length % 64 !== 56) msg.push(0)
  // High 32 bits of length = 0 (input is short); low 32 bits = bit length
  msg.push(0, 0, 0, 0)
  msg.push(
    (originalBitLen >>> 24) & 0xff,
    (originalBitLen >>> 16) & 0xff,
    (originalBitLen >>> 8) & 0xff,
    originalBitLen & 0xff,
  )

  // Initial hash values (FIPS 180-4)
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  // Process each 512-bit (64-byte) block
  for (let offset = 0; offset < msg.length; offset += 64) {
    const w = new Uint32Array(80)

    // First 16 words from the block (big-endian)
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4
      w[i] = (msg[j]! << 24) | (msg[j + 1]! << 16) | (msg[j + 2]! << 8) | msg[j + 3]!
    }
    // Extend to 80 words
    for (let i = 16; i < 80; i++) {
      w[i] = rotl(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }

      const temp = (rotl(a, 5) + f + e + k + w[i]!) | 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = temp
    }

    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }

  return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('')
}

// ---------------------------------------------------------------------------
// Leading zero bits check
// ---------------------------------------------------------------------------

/**
 * Check if a hex hash string has at least `bits` leading zero bits.
 *
 * For `bits=9`: first 2 hex digits (8 bits) must be '00', and the 3rd hex
 * digit's MSB must be 0 (value 0–7).
 */
export function hasLeadingZeroBits(hexHash: string, bits: number): boolean {
  const fullHexZeros = Math.floor(bits / 4)
  const remainingBits = bits % 4

  for (let i = 0; i < fullHexZeros; i++) {
    if (hexHash[i] !== '0') return false
  }
  if (remainingBits > 0) {
    const digit = parseInt(hexHash[fullHexZeros]!, 16)
    if (Number.isNaN(digit)) return false
    const mask = (0xf << (4 - remainingBits)) & 0xf
    if ((digit & mask) !== 0) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Challenge detection & parsing
// ---------------------------------------------------------------------------

/** Marker that appears in the SafeLine WAF challenge HTML. */
const SAFELINE_MARKER = 'WEB 应用防火墙'

/** Check if a response body is a SafeLine WAF challenge page. */
export function isSafelineChallenge(text: string): boolean {
  return text.includes(SAFELINE_MARKER) || text.includes('js-challenge')
}

export type SafelineChallenge = {
  prefix: string
  leadingZeroBits: number
}

/**
 * Parse `prefix` (arg1) and `leadingZeroBits` (arg2) from the challenge HTML.
 * Returns null if the expected `var prefix` / `var leading_zero_bit` patterns
 * are not found (challenge format may have changed).
 */
export function parseSafelineChallenge(html: string): SafelineChallenge | null {
  const prefixMatch = html.match(/var\s+prefix\s*=\s*'([^']+)'/)
  const bitsMatch = html.match(/var\s+leading_zero_bit\s*=\s*(\d+)/)
  if (!prefixMatch || !bitsMatch) return null
  const leadingZeroBits = parseInt(bitsMatch[1]!, 10)
  if (!Number.isFinite(leadingZeroBits) || leadingZeroBits <= 0) return null
  return { prefix: prefixMatch[1]!, leadingZeroBits }
}

// ---------------------------------------------------------------------------
// Proof-of-work solving
// ---------------------------------------------------------------------------

/** Safety limit to prevent infinite loops if the difficulty is unreasonable. */
const MAX_POW_ITERATIONS = 1_000_000

/**
 * Solve the SafeLine proof-of-work: find a hex suffix such that
 * SHA1(prefix + suffix) has `leadingZeroBits` leading zero bits.
 *
 * With the typical difficulty of 9 bits, this completes in <100ms (~512
 * iterations on average).
 */
export function solveSafelinePow(prefix: string, leadingZeroBits: number): string {
  let cnt = 0
  while (cnt < MAX_POW_ITERATIONS) {
    const suffix = cnt.toString(16)
    if (hasLeadingZeroBits(sha1Hex(prefix + suffix), leadingZeroBits)) {
      return suffix
    }
    cnt++
  }
  console.warn(
    '[gm-dashboard] safeline.solveSafelinePow: exceeded max iterations',
    MAX_POW_ITERATIONS,
    'prefix',
    prefix,
    'bits',
    leadingZeroBits,
  )
  return '0'
}

// ---------------------------------------------------------------------------
// Cookie handling
// ---------------------------------------------------------------------------

/**
 * Extract the `safeline_bot_challenge` cookie value from response headers.
 *
 * `responseHeaders` is the raw string from GM_xmlhttpRequest's onload callback,
 * with lines separated by `\r\n` or `\n`, e.g.:
 *   "Content-Type: text/html\r\nSet-Cookie: safeline_bot_challenge=AQAA...; Max-Age=60\r\n"
 */
export function extractSafelineCookie(responseHeaders: string): string | null {
  const lines = responseHeaders.split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/^Set-Cookie:\s*safeline_bot_challenge=([^;]+)/i)
    if (m) return m[1]!
  }
  return null
}

/**
 * Build the Cookie header for the retry request.
 *
 * The WAF expects both `safeline_bot_challenge` (original token) and
 * `safeline_bot_challenge_ans` (token + solved suffix).
 */
export function buildSafelineCookieHeader(challengeCookie: string, suffix: string): string {
  return `safeline_bot_challenge=${challengeCookie}; safeline_bot_challenge_ans=${challengeCookie}${suffix}`
}
