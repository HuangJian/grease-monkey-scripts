/**
 * Userscript build script.
 *
 * Pipeline per script:
 *   1. Build debug bundle (original source, unminified) → compute content hash
 *   2. Build prod bundle (unminified) → minify with SWC → reuse same hash
 *
 * SWC replaces Terser. Its `pure_funcs` option removes console.log/console.debug
 * while keeping console.warn/console.error. Post-minification micro-optimizations
 * strip dev-only JSX arguments, replace `void 0` with `0[0]`, and convert
 * simple wrapper functions to arrow functions.
 *
 * Scripts that ship _preact-shim.ts + _preact-hooks-shim.ts externalize
 * Preact via Tampermonkey @require — a Bun.build plugin redirects every
 * `import … from 'preact'` / `'preact/hooks'` to the shim, which reads
 * from the global set by the UMD build.
 *
 * Hash is SHA-256 of the bundle content (first 8 hex chars). If the hash
 * matches the existing file on disk, the build is skipped.
 */

import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { bundle as bundleCss, transform } from 'lightningcss'
import { minify as swcMinify } from '@swc/core'
import type { JsMinifyOptions } from '@swc/types'
import { compressToUTF16 } from 'lz-string'
import type { BunPlugin } from 'bun'

// ---------------------------------------------------------------------------
// Source file helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all .ts/.tsx source files (excluding .d.ts) under dir.
 * Returns a Map<absolutePath, fileContent> for later restoration.
 */
async function collectSourceFiles(dir: string): Promise<Map<string, string>> {
  const originals = new Map<string, string>()
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await collectSourceFiles(full)
      for (const [k, v] of nested) originals.set(k, v)
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.d.ts')
    ) {
      originals.set(full, await readFile(full, 'utf8'))
    }
  }
  return originals
}

/** Write every file back to its original content. */
async function restoreSourceFiles(originals: Map<string, string>): Promise<void> {
  for (const [path, content] of originals) {
    await writeFile(path, content, 'utf8')
  }
}

// ---------------------------------------------------------------------------
// Preact externalization plugin
// ---------------------------------------------------------------------------

/**
 * If the script directory contains _preact-shim.ts and _preact-hooks-shim.ts,
 * return a Bun.build plugin that redirects `preact` and `preact/hooks` imports
 * to those shims. The shims read from the global `window.preact` /
 * `window.preactHooks` set by the Tampermonkey @require'd UMD builds.
 */
function createPreactExternalPlugin(scriptDir: string) {
  const shimPath = resolve(scriptDir, '_preact-shim.ts')
  const hooksShimPath = resolve(scriptDir, '_preact-hooks-shim.ts')
  try {
    readFileSync(shimPath, 'utf8')
    readFileSync(hooksShimPath, 'utf8')
  } catch {
    return []
  }
  return [
    {
      name: 'preact-external',
      setup(build) {
        build.onResolve({ filter: /^preact$/ }, () => ({ path: shimPath }))
        build.onResolve({ filter: /^preact\/hooks$/ }, () => ({ path: hooksShimPath }))
      },
    } satisfies BunPlugin,
  ]
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
function stripJsxDevArgs(code: string): string {
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
function postSwcOptimize(code: string): string {
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
// SWC minify options for prod builds
// ---------------------------------------------------------------------------

const SWC_OPTIONS: JsMinifyOptions = {
  compress: {
    passes: 3,
    drop_debugger: true,
    pure_funcs: ['console.log', 'console.debug'],
    unsafe: true,
    toplevel: true,
    join_vars: true,
    hoist_props: true,
    reduce_vars: true,
    unused: true,
    dead_code: true,
    sequences: true,
    properties: true,
    conditionals: true,
    comparisons: true,
    evaluate: true,
    booleans: true,
    loops: true,
    if_return: true,
    collapse_vars: true,
    inline: 2,
  },
  mangle: { toplevel: true },
  format: { comments: false },
  module: true,
}

// ---------------------------------------------------------------------------
// CSS pipeline
// ---------------------------------------------------------------------------

/** Parse CSS custom properties (--xxx: value;) into a Map. */
function parseCssVariables(tokensCss: string): Map<string, string> {
  const vars = new Map<string, string>()
  const re = /(--[a-z][a-z0-9-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tokensCss)) !== null) {
    vars.set(m[1]!, m[2]!.trim())
  }
  return vars
}

/** Replace var(--name) references with their values, up to MAX_DEPTH passes. */
function resolveVarReferences(css: string, vars: Map<string, string>): string {
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

/** Minify CSS using Lightning CSS. */
function minifyCss(css: string): string {
  const { code } = transform({
    filename: 'tokens.css',
    code: Buffer.from(css),
    minify: true,
  })
  return code.toString()
}

/**
 * Build CSS from a script directory's index.css.
 *
 * Steps:
 *   1. Bundle index.css via Lightning CSS (resolves @import)
 *   2. Resolve var(--xxx) references from tokens.css
 *   3. Remove :host {} blocks (Web Components syntax)
 *   4. Minify for prod builds
 */
function buildCss(scriptDir: string, debug: boolean): string {
  const indexCssPath = resolve(scriptDir, 'index.css')

  try {
    readFileSync(indexCssPath, 'utf8')
  } catch {
    return ''
  }

  const { code } = bundleCss({
    filename: indexCssPath,
    minify: false,
  })
  let css = code.toString()

  const tokensPath = findTokensCss(scriptDir)
  if (tokensPath) {
    const tokensCss = readFileSync(tokensPath, 'utf8')
    const vars = parseCssVariables(tokensCss)
    css = resolveVarReferences(css, vars)
  }

  css = css.replace(/:host\s*\{[^}]*\}/g, '')

  if (!debug) {
    css = minifyCss(css)
  }

  return css
}

/** Find tokens.css in dir or its immediate subdirectories. */
function findTokensCss(dir: string): string | null {
  const direct = resolve(dir, 'tokens.css')
  try {
    readFileSync(direct, 'utf8')
    return direct
  } catch {}
  for (const sub of readdirSync(dir, { withFileTypes: true })) {
    if (sub.isDirectory()) {
      const nested = resolve(dir, sub.name, 'tokens.css')
      try {
        readFileSync(nested, 'utf8')
        return nested
      } catch {}
    }
  }
  return null
}

/** Escape special characters for safe embedding in a JS template literal. */
function escapeForTemplateLiteral(css: string): string {
  return css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

// ---------------------------------------------------------------------------
// Hash utilities
// ---------------------------------------------------------------------------

/** Compute SHA-256 hash of content, return first 8 hex chars. */
function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 8)
}

/**
 * Read the build hash from an existing output file.
 * Expects the last line to be "// build <hash>".
 */
function readExistingHash(file: string): string | null {
  try {
    const content = readFileSync(file, 'utf8')
    const lastLine = content.trimEnd().split('\n').pop()!
    const match = lastLine.match(/^\/\/ build ([a-f0-9]+)$/)
    return match ? match[1]! : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Build modes
// ---------------------------------------------------------------------------

const BUILD_MODES = [
  { suffix: '.debug.js', debug: true },
  { suffix: '.user.js', debug: false },
] as const

type BuildMode = (typeof BUILD_MODES)[number]

// ---------------------------------------------------------------------------
// Core: build a single userscript
// ---------------------------------------------------------------------------

/**
 * Build one userscript and return the final file content (metadata + bundle).
 *
 * For simple scripts: injects GM_addStyle(__css) into the entry file.
 * For Dashboard: replaces CSS_TO_BE_INJECTED placeholder in mount.tsx.
 */
async function buildUserScript(entrypoint: string, mode: BuildMode): Promise<string> {
  const name = basename(dirname(entrypoint))
  const scriptDir = dirname(entrypoint)

  let entrypointSource = await readFile(entrypoint, 'utf8')

  // Extract userscript metadata block (// ==UserScript== ... // ==/UserScript==)
  const metadataMatch = entrypointSource.match(
    /^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m,
  )
  const metadata = metadataMatch ? metadataMatch[0] : null

  if (!metadata) {
    throw new Error(`Missing userscript metadata block in ${entrypoint}`)
  }

  await mkdir('dist', { recursive: true })

  const temporaryOutfile = `dist/.${name}${mode.debug ? '.debug' : '.prod'}.bundle.js`

  const css = buildCss(scriptDir, mode.debug)

  const originals = await collectSourceFiles(scriptDir)

  const tempFiles: string[] = []

  try {
    if (css) {
      // Prod: compress CSS with LZ-string to save ~28 KB in the bundle.
      // Debug: keep raw CSS for readability.
      const cssToInject = mode.debug ? css : compressToUTF16(css)
      const escapedCss = escapeForTemplateLiteral(cssToInject)

      // Dashboard scripts inject CSS via CSS_TO_BE_INJECTED placeholder in
      // a Preact <style> tag. Simple scripts inject via GM_addStyle() in the
      // entry file. Detect which mode this script uses by checking if any
      // source file references CSS_TO_BE_INJECTED.
      const isDashboardScript = [...originals.values()].some((c) =>
        c.includes('CSS_TO_BE_INJECTED'),
      )

      for (const [srcPath, content] of originals) {
        // Dashboard: replace CSS_TO_BE_INJECTED placeholder with actual CSS
        if (content.includes('CSS_TO_BE_INJECTED')) {
          const replacement = mode.debug
            ? `export const CSS_TO_BE_INJECTED = \`${escapedCss}\``
            : `export const CSS_TO_BE_INJECTED = LZString.decompressFromUTF16(\`${escapedCss}\`)`
          const modified = content.replace(/export const CSS_TO_BE_INJECTED = .*$/m, replacement)
          await writeFile(srcPath, modified, 'utf8')
        }

        // Simple scripts: inject GM_addStyle() call after the last import
        if (srcPath === entrypoint && !isDashboardScript) {
          const importRe = /^import\s.+?\n/gm
          let lastImportEnd = 0
          let im: RegExpExecArray | null
          while ((im = importRe.exec(content)) !== null) {
            lastImportEnd = im.index + im[0].length
          }
          const injection = `\n\nGM_addStyle(\`${escapedCss}\`)\n`
          if (lastImportEnd > 0) {
            entrypointSource =
              content.slice(0, lastImportEnd) + injection + content.slice(lastImportEnd)
          } else {
            entrypointSource = injection + content
          }
        }
      }
    }

    // Remove ==build.meta== block (should no longer exist, but safety net)
    const baseSource = entrypointSource.replace(
      /^\/\/ ==build.meta==[\s\S]*?^\/\/ ==\/build.meta==/m,
      '',
    )
    const temporarySourceFile = join(scriptDir, `.index${mode.debug ? '' : '.prod'}.user.ts`)
    await writeFile(temporarySourceFile, baseSource, 'utf8')
    tempFiles.push(temporarySourceFile)

    // Build with Bun.build JS API (never minify — SWC handles prod)
    const plugins = createPreactExternalPlugin(scriptDir)
    const result = await Bun.build({
      entrypoints: [temporarySourceFile],
      target: 'browser',
      format: 'iife',
      sourcemap: 'none',
      outdir: dirname(temporaryOutfile),
      naming: basename(temporaryOutfile),
      minify: false,
      plugins,
    })

    if (!result.success) {
      const msgs = result.logs?.map((l) => ('message' in l ? l.message : String(l))).join('; ')
      throw new Error(`Bun.build failed${msgs ? ': ' + msgs : ''}`)
    }

    let bundle = await result.outputs[0]!.text()

    // Prod: minify with SWC, then apply post-SWC micro-optimizations
    if (!mode.debug) {
      const out = await swcMinify(bundle, SWC_OPTIONS)
      bundle = postSwcOptimize(out.code!)
    }

    return `${metadata}\n\n${bundle}`
  } finally {
    // Always restore source files and clean up temp files
    await restoreSourceFiles(originals)
    for (const f of [...tempFiles, temporaryOutfile]) {
      try {
        await unlink(f)
      } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const FORCE_REBUILD = process.argv.includes('--full')
  const srcDir = 'src'
  const entries: string[] = []

  // Discover all scripts: directories under src/ with an index.user.ts
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const ep = join(srcDir, entry.name, 'index.user.ts')
    try {
      await readFile(ep)
      entries.push(ep)
    } catch {}
  }

  if (entries.length === 0) {
    console.log('No index.user.ts files found in src subdirectories')
    return
  }

  const hashes = new Map<string, string>()
  const built: string[] = []
  const errors: string[] = []

  // Phase 1: Build all debug scripts in parallel (original source, unminified)
  // Hash is computed from the debug bundle content.
  await Promise.all(
    entries.map(async (entrypoint) => {
      const name = basename(dirname(entrypoint))
      const prodFile = `dist/${name}.user.js`
      const prevHash = FORCE_REBUILD ? '' : (readExistingHash(prodFile) ?? '')

      try {
        const bundle = await buildUserScript(entrypoint, BUILD_MODES[0])
        const hash = computeHash(bundle)
        hashes.set(name, hash)

        if (prevHash !== hash) {
          const outfile = `dist/${name}${BUILD_MODES[0].suffix}`
          await writeFile(outfile, `${bundle}\n// build ${hash}`)
          built.push(`${name} (${hash})`)
        }
      } catch (error) {
        errors.push(`${name}: ${error}`)
      }
    }),
  )

  // Phase 2: Build prod scripts (SWC minification, no source stripping needed)
  await Promise.all(
    entries.map(async (entrypoint) => {
      const name = basename(dirname(entrypoint))
      const hash = hashes.get(name)
      if (!hash) return
      const prodFile = `dist/${name}.user.js`
      if (!FORCE_REBUILD && readExistingHash(prodFile) === hash) return

      try {
        const bundle = await buildUserScript(entrypoint, BUILD_MODES[1])
        await writeFile(prodFile, `${bundle}\n// build ${hash}`)
      } catch (error) {
        errors.push(`${name} prod: ${error}`)
      }
    }),
  )

  // Update built entries with actual file sizes
  for (const entrypoint of entries) {
    const name = basename(dirname(entrypoint))
    if (!built.some((s) => s.startsWith(`${name} (`))) continue
    const idx = built.findIndex((s) => s.startsWith(`${name} (`))
    const prodSize = (await stat(`dist/${name}.user.js`)).size
    const debugSize = (await stat(`dist/${name}.debug.js`)).size
    const hash = hashes.get(name)!
    built[idx] =
      `${name} (${(prodSize / 1024).toFixed(1)}/${(debugSize / 1024).toFixed(1)} KB, ${hash})`
  }

  if (built.length > 0) {
    console.log(`✓ [built] ${built.join(', ')}`)
  } else {
    console.log('All scripts unchanged, nothing to build.')
  }
  for (const err of errors) {
    console.error(`✗ ${err}`)
  }
  if (errors.length > 0) process.exit(1)
}

void main()
