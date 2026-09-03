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
 * (chrsz=8, each char = 1 byte). Implemented in terms of `sha1Digest`.
 */
function asciiBytes(input: string): Uint8Array {
  const out = new Uint8Array(input.length)
  for (let i = 0; i < input.length; i++) out[i] = input.charCodeAt(i) & 0xff
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i]! >> 4).toString(16) + (bytes[i]! & 0xf).toString(16)
  }
  return s
}

function writeUint32(out: Uint8Array, off: number, v: number): void {
  out[off] = (v >>> 24) & 0xff
  out[off + 1] = (v >>> 16) & 0xff
  out[off + 2] = (v >>> 8) & 0xff
  out[off + 3] = v & 0xff
}

// Reused across digest calls (single-threaded; the solve loop awaits yields so
// there is no reentrancy). Avoids a fresh allocation per SHA-1 call.
const W = new Uint32Array(80)

/**
 * Core SHA-1 over arbitrary bytes. Returns the 20-byte big-endian digest.
 * Exposed for tests and reused by the PoW solver to skip the hex round-trip.
 */
export function sha1Digest(msg: Uint8Array): Uint8Array {
  const originalBitLen = msg.length * 8
  // Pad: 0x80, then zeros until length ≡ 56 (mod 64), then 8-byte big-endian length
  let paddedLen = msg.length + 1
  while (paddedLen % 64 !== 56) paddedLen++
  paddedLen += 8
  const m = new Uint8Array(paddedLen)
  m.set(msg)
  m[msg.length] = 0x80
  // High 32 bits of length = 0 (inputs are short); low 32 bits = bit length
  m[paddedLen - 4] = (originalBitLen >>> 24) & 0xff
  m[paddedLen - 3] = (originalBitLen >>> 16) & 0xff
  m[paddedLen - 2] = (originalBitLen >>> 8) & 0xff
  m[paddedLen - 1] = originalBitLen & 0xff

  // Initial hash values (FIPS 180-4)
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  // Process each 512-bit (64-byte) block
  for (let offset = 0; offset < m.length; offset += 64) {
    // First 16 words from the block (big-endian)
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4
      W[i] = (m[j]! << 24) | (m[j + 1]! << 16) | (m[j + 2]! << 8) | m[j + 3]!
    }
    // Extend to 80 words
    for (let i = 16; i < 80; i++) {
      W[i] = rotl(W[i - 3]! ^ W[i - 8]! ^ W[i - 14]! ^ W[i - 16]!, 1)
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

      const temp = (rotl(a, 5) + f + e + k + W[i]!) | 0
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

  const out = new Uint8Array(20)
  writeUint32(out, 0, h0)
  writeUint32(out, 4, h1)
  writeUint32(out, 8, h2)
  writeUint32(out, 12, h3)
  writeUint32(out, 16, h4)
  return out
}

export function sha1Hex(input: string): string {
  return bytesToHex(sha1Digest(asciiBytes(input)))
}

/**
 * Check if a raw 20-byte SHA-1 digest has at least `bits` leading zero bits.
 * Used by the PoW solver so the hot loop never builds a hex string.
 */
export function hasLeadingZeroBitsBytes(bytes: Uint8Array, bits: number): boolean {
  let total = 0
  for (let i = 0; i < bytes.length && total < bits; i++) {
    const b = bytes[i]!
    if (b === 0) {
      total += 8
      continue
    }
    let z = 0
    for (let mask = 0x80; mask !== 0; mask >>= 1) {
      if ((b & mask) === 0) z++
      else break
    }
    total += z
    break
  }
  return total >= bits
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
 * Above this difficulty we give up immediately rather than burn CPU: a misconfigured
 * or malicious server asking for >20 bits would otherwise attempt ~1M SHA-1 calls.
 */
const MAX_DIFFICULTY_BITS = 20

/** A function the solver awaits periodically to yield the main thread. */
export type PowYield = () => Promise<void>

/**
 * Solve the SafeLine proof-of-work: find a hex suffix such that
 * SHA1(prefix + suffix) has `leadingZeroBits` leading zero bits.
 *
 * Async so it can yield the main thread every `yieldEvery` iterations (the
 * caller passes a `runtime.setTimeout`-based yield). With the typical
 * difficulty of 9 bits this completes in <100ms (~512 iterations on average)
 * and never yields; only high difficulty approaches the yield boundary.
 *
 * Throws instead of returning a doomed `'0'` on failure, so the caller's
 * `Promise.allSettled` can degrade to the open-meteo fallback.
 */
export async function solveSafelinePow(
  prefix: string,
  leadingZeroBits: number,
  options: { yieldEvery?: number; maxIterations?: number; yield?: PowYield } = {},
): Promise<string> {
  if (leadingZeroBits > MAX_DIFFICULTY_BITS) {
    throw new Error(
      `[gm-dashboard] safeline.solveSafelinePow: difficulty ${leadingZeroBits} bits exceeds guard ${MAX_DIFFICULTY_BITS}, giving up`,
    )
  }
  const yieldEvery = options.yieldEvery ?? 4096
  const maxIterations = options.maxIterations ?? MAX_POW_ITERATIONS
  const yieldFn = options.yield ?? (() => Promise.resolve())

  const prefixBytes = asciiBytes(prefix)
  let cnt = 0
  while (cnt < maxIterations) {
    const suffix = cnt.toString(16)
    const full = new Uint8Array(prefixBytes.length + suffix.length)
    full.set(prefixBytes)
    for (let i = 0; i < suffix.length; i++)
      full[prefixBytes.length + i] = suffix.charCodeAt(i) & 0xff
    if (hasLeadingZeroBitsBytes(sha1Digest(full), leadingZeroBits)) return suffix
    cnt++
    if (yieldEvery > 0 && cnt % yieldEvery === 0) await yieldFn()
  }
  throw new Error(
    `[gm-dashboard] safeline.solveSafelinePow: exceeded max iterations ${maxIterations}`,
  )
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
