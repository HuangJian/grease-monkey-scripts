/**
 * Pure utility functions extracted from build-userscript.ts for unit testing.
 *
 * These functions have no filesystem or native-dependency side effects,
 * making them safe to test in isolation.
 */

import { createHash } from 'node:crypto'
import { compressToUTF16 } from 'lz-string'

// ---------------------------------------------------------------------------
// CSS pipeline (pure parts)
// ---------------------------------------------------------------------------

/** Parse CSS custom properties (--xxx: value;) into a Map. */
export function parseCssVariables(tokensCss: string): Map<string, string> {
  const vars = new Map<string, string>()
  const re = /(--[a-z][a-z0-9-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tokensCss)) !== null) {
    vars.set(m[1]!, m[2]!.trim())
  }
  return vars
}

/** Replace var(--name) references with their values, up to MAX_DEPTH passes. */
export function resolveVarReferences(css: string, vars: Map<string, string>): string {
  const MAX_DEPTH = 5
  let result = css
  for (let i = 0; i < MAX_DEPTH; i++) {
    let changed = false
    result = result.replace(/var\((--[a-z][a-z0-9-]+)\)/g, (_, name) => {
      const val = vars.get(name)
      if (val) {
        changed = true
        return val
      }
      return `var(${name})`
    })
    if (!changed) break
  }
  return result
}

/** Escape special characters for safe embedding in a JS template literal. */
export function escapeForTemplateLiteral(css: string): string {
  return css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

// ---------------------------------------------------------------------------
// CSS injection helpers
// ---------------------------------------------------------------------------

/**
 * Build the GM_addStyle injection string for a simple (non-dashboard) script.
 *
 * When `useLzCompression` is true (script @requires lz-string), CSS is
 * compressed with LZ-string and decompressed at runtime via
 * `LZString.decompressFromUTF16()`. Otherwise, raw CSS is injected directly.
 */
export function buildSimpleCssInjection(css: string, useLzCompression = false): string {
  if (useLzCompression) {
    const escaped = escapeForTemplateLiteral(compressToUTF16(css))
    return `GM_addStyle(LZString.decompressFromUTF16(\`${escaped}\`))`
  }
  const escaped = escapeForTemplateLiteral(css)
  return `GM_addStyle(\`${escaped}\`)`
}

/**
 * Build the `CSS_TO_BE_INJECTED` replacement line for a dashboard script.
 *
 * CSS is compressed with LZ-string only in prod mode AND when the script
 * @requires lz-string (signaled by `useLzCompression`). Debug builds always
 * use raw CSS for readability.
 */
export function buildDashboardCssReplacement(
  css: string,
  debug: boolean,
  useLzCompression: boolean,
): string {
  const shouldCompress = !debug && useLzCompression
  const cssToInject = shouldCompress ? compressToUTF16(css) : css
  const escaped = escapeForTemplateLiteral(cssToInject)
  if (shouldCompress) {
    return `export const CSS_TO_BE_INJECTED = LZString.decompressFromUTF16(\`${escaped}\`)`
  }
  return `export const CSS_TO_BE_INJECTED = \`${escaped}\``
}

// ---------------------------------------------------------------------------
// Post-SWC micro-optimizations for prod builds
// ---------------------------------------------------------------------------

/**
 * Strip dev-only JSX call arguments from minified output.
 *
 * Bun compiles JSX with the automatic runtime, generating calls like:
 *   jsx(type, props, key, flags, __source, __self)
 *
 * The last THREE arguments (flags, __source, __self) are dev-only and ignored
 * by the jsx-runtime. They are always:
 *   flags:   0, !0, or !1
 *   __source: void 0 (SWC)
 *   __self:  this
 *
 * We strip just these 3 args, leaving `key` intact:
 *   ,<flags>,<source>,this) → )
 *
 * After this, calls where key was `void 0` (undefined key) are left as
 * `...,void 0)`. Since Preact's jsx() defaults key to undefined, we can
 * also strip that trailing `,void 0)`.
 */
export function stripJsxDevArgs(code: string): string {
  // Strip the 3 dev-only trailing args: ,<flags>,<source>,this) → )
  code = code.replace(/,(?:!0|!1|0),(?:void 0|0\[0\]),this\)/g, ')')

  // Strip trailing ,void 0) left from JSX calls with undefined key.
  // Preact's jsx(type, props, key) treats missing key same as key=undefined.
  // Safe because after the dev-arg strip above, these ,void 0) only appear
  // as the last arg of jsx calls — all other void 0 uses are in comparisons
  // (void 0===x), assignments (=void 0), or expressions (||void 0).
  code = code.replaceAll(',void 0)', ')')

  return code
}

/**
 * Apply byte-saving transformations to the SWC-minified output.
 *
 * 1. Strip dev-only JSX call arguments (saves ~8 KB across ~650 call sites).
 * 2. Replace `void 0` with `0[0]` (3 bytes shorter per occurrence, same
 *    semantics — both evaluate to `undefined`).
 * 3. Simple wrapper functions → arrow functions:
 *    `function foo(a,b){return bar(a,b)}` → `let foo=(a,b)=>bar(a,b)`
 *    saves ~7 bytes per function.
 */
export function postSwcOptimize(code: string): string {
  // 1. Strip dev-only JSX call arguments
  code = stripJsxDevArgs(code)

  // 2. void 0 → 0[0] (3 bytes shorter per occurrence, same semantics)
  code = code.replaceAll('void 0', '0[0]')

  // 3. Simple wrapper functions → arrow functions
  //    Pattern: [async] function name(params){return expr}
  //    Only matches single-return-statement functions with no this/arguments use.
  //    Trailing ; is required: function declarations don't need semicolons
  //    (ASI handles them), but let assignments do — and minified output is a
  //    single line so ASI never triggers.
  //    The optional `async ` prefix must be captured and moved to the arrow
  //    function — otherwise `async function foo(){return bar()}` becomes the
  //    invalid `async let foo=()=>bar();`.
  code = code.replace(
    /(async )?function (\w+)\(([^)]*)\)\{return ([^;{}]+)\}/g,
    (_, async, name, params, expr) => `let ${name}=${async ? 'async' : ''}(${params})=>${expr};`,
  )

  return code
}

// ---------------------------------------------------------------------------
// Hash utilities
// ---------------------------------------------------------------------------

/** Compute SHA-256 hash of content, return first 8 hex chars. */
export function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 8)
}

/**
 * Parse the build hash from file content.
 * Expects the last line to be "console.debug('<name>:build <hash>')".
 */
export function parseBuildHash(content: string): string | null {
  const lastLine = content.trimEnd().split('\n').pop()!
  const match = lastLine.match(/^.+?build ([a-f0-9]+)'\)\s*$/)
  return match ? match[1]! : null
}
