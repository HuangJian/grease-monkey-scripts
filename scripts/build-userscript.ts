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
 * Hash is SHA-256 of the debug bundle content + build script source code
 * (first 8 hex chars). Including the build script source ensures that build
 * logic changes trigger a rebuild even when script source is unchanged.
 * If the hash matches the existing file on disk, the build is skipped.
 */

import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { bundle as bundleCss, transform } from 'lightningcss'
import { minify as swcMinify } from '@swc/core'
import type { JsMinifyOptions } from '@swc/types'
import type { BunPlugin } from 'bun'
import {
  buildDashboardCssReplacement,
  buildSimpleCssInjection,
  computeHash,
  parseBuildHash,
  parseCssVariables,
  postSwcOptimize,
  resolveVarReferences,
} from './build-utils'

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

// ---------------------------------------------------------------------------
// Hash utilities
// ---------------------------------------------------------------------------

/**
 * Read the build hash from an existing output file.
 * Expects the last line to be "// build <hash>".
 */
function readExistingHash(file: string): string | null {
  try {
    return parseBuildHash(readFileSync(file, 'utf8'))
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

  // Check whether the script @requires lz-string — determines if CSS is
  // compressed with LZ-string in prod builds.
  const hasLzStringRequire = /@require\s+[^\n]*lz-string/.test(metadata)

  await mkdir('dist', { recursive: true })

  const temporaryOutfile = `dist/.${name}${mode.debug ? '.debug' : '.prod'}.bundle.js`

  const css = buildCss(scriptDir, mode.debug)

  const originals = await collectSourceFiles(scriptDir)

  const tempFiles: string[] = []

  try {
    if (css) {
      // Dashboard scripts inject CSS via CSS_TO_BE_INJECTED placeholder in
      // a Preact <style> tag (with LZ-string compression in prod). Simple
      // scripts inject raw CSS via GM_addStyle() — no compression/decompression
      // dependency needed.
      const isDashboardScript = [...originals.values()].some((c) =>
        c.includes('CSS_TO_BE_INJECTED'),
      )

      for (const [srcPath, content] of originals) {
        // Dashboard: replace CSS_TO_BE_INJECTED placeholder with actual CSS
        if (content.includes('CSS_TO_BE_INJECTED')) {
          const replacement = buildDashboardCssReplacement(css, mode.debug, hasLzStringRequire)
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
          const injection = `\n\n${buildSimpleCssInjection(css, hasLzStringRequire)}\n`
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
  const built: { name: string; hash: string; prodSize?: number; debugSize?: number }[] = []
  const errors: string[] = []

  // Include build script source in hash so that build logic changes trigger
  // a rebuild even when script source is unchanged.
  const buildScriptSource = [
    readFileSync('scripts/build-userscript.ts', 'utf8'),
    readFileSync('scripts/build-utils.ts', 'utf8'),
  ].join('\n')

  // Phase 1: Build all debug scripts in parallel (original source, unminified)
  // Hash is computed from the debug bundle content + build script source.
  await Promise.all(
    entries.map(async (entrypoint) => {
      const name = basename(dirname(entrypoint))
      const prodFile = `dist/${name}.user.js`
      const prevHash = FORCE_REBUILD ? '' : (readExistingHash(prodFile) ?? '')

      try {
        const bundle = await buildUserScript(entrypoint, BUILD_MODES[0])
        const hash = computeHash(bundle + buildScriptSource)
        hashes.set(name, hash)

        if (prevHash !== hash) {
          const outfile = `dist/${name}${BUILD_MODES[0].suffix}`
          await writeFile(outfile, `${bundle}\nconsole.debug('${name}:build ${hash}')`)
          built.push({ name, hash })
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
        await writeFile(prodFile, `${bundle}\nconsole.debug('${name}:build ${hash}')`)
      } catch (error) {
        errors.push(`${name} prod: ${error}`)
      }
    }),
  )

  // Update built entries with actual file sizes
  for (const entrypoint of entries) {
    const name = basename(dirname(entrypoint))
    const idx = built.findIndex((b) => b.name === name)
    if (idx === -1) continue
    const prodSize = (await stat(`dist/${name}.user.js`)).size
    const debugSize = (await stat(`dist/${name}.debug.js`)).size
    const hash = hashes.get(name)!
    built[idx].prodSize = prodSize
    built[idx].debugSize = debugSize
    built[idx].hash = hash
  }

  if (built.length > 0) {
    const rows = built.map((b) => ({
      name: b.name,
      prod: b.prodSize !== undefined ? (b.prodSize / 1024).toFixed(1) : '',
      debug: b.debugSize !== undefined ? (b.debugSize / 1024).toFixed(1) : '',
      hash: b.hash,
    }))

    const namePad = Math.max(...rows.map((r) => r.name.length), 'Name'.length)
    const prodPad = Math.max(...rows.map((r) => r.prod.length), 'Prod (KB)'.length)
    const debugPad = Math.max(...rows.map((r) => r.debug.length), 'Debug (KB)'.length)

    // Header with unit in column labels
    console.log(
      `  ${'Name'.padEnd(namePad)}  ${'Prod (KB)'.padEnd(prodPad)}  ${'Debug (KB)'.padEnd(
        debugPad,
      )}  Hash`,
    )
    console.log(
      `  ${'-'.repeat(namePad)}  ${'-'.repeat(prodPad)}  ${'-'.repeat(debugPad)}  ${'-'.repeat(8)}`,
    )

    // Rows — right-align numeric size columns
    rows.forEach((r) =>
      console.log(
        `✓ ${r.name.padEnd(namePad)}  ${r.prod.padStart(prodPad)}  ${r.debug.padStart(debugPad)}  ${r.hash}`,
      ),
    )
  } else {
    console.log('All scripts unchanged, nothing to build.')
  }
  for (const err of errors) {
    console.error(`✗ ${err}`)
  }
  if (errors.length > 0) process.exit(1)
}

void main()
