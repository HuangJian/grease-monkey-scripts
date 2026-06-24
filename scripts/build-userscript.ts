/**
 * Userscript build script.
 *
 * Pipeline per script:
 *   1. Build debug bundle (original source, unminified) → compute content hash
 *   2. Strip console.log/debug from source if any script changed
 *   3. Build prod bundle (stripped source, minified) → reuse same hash
 *
 * Hash is SHA-256 of the bundle content (first 8 hex chars). If the hash
 * matches the existing file on disk, the build is skipped.
 */

import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { $ } from 'bun'
import { bundle as bundleCss, transform } from 'lightningcss'

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
// console.log / console.debug stripper
// ---------------------------------------------------------------------------

/**
 * Remove console.log(...) and console.debug(...) calls from source.
 * Handles nested parentheses and trailing semicolons.
 */
function stripConsoleFromSource(source: string): string {
  const CONSOLE_RE = /console\.(log|debug)\(/
  let result = source
  let match: RegExpExecArray | null

  while ((match = CONSOLE_RE.exec(result)) !== null) {
    const start = match.index
    const parenStart = match[0].length - 1 + start

    // Find matching closing paren
    let depth = 1
    let i = parenStart + 1
    while (i < result.length && depth > 0) {
      const ch = result[i]!
      if (ch === '(') depth++
      else if (ch === ')') depth--
      i++
    }
    const callEnd = i

    // Include trailing semicolon if present
    let end = callEnd
    if (end < result.length && result[end] === ';') end++

    // Include leading whitespace/newline
    let begin = start
    while (begin > 0 && (result[begin - 1] === ' ' || result[begin - 1] === '\t')) begin--
    if (begin > 0 && result[begin - 1] === '\n') begin--

    result = result.slice(0, begin) + result.slice(end)
    CONSOLE_RE.lastIndex = begin
  }

  return result
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
      const escapedCss = escapeForTemplateLiteral(css)
      for (const [srcPath, content] of originals) {
        // Dashboard: replace CSS_TO_BE_INJECTED placeholder with actual CSS
        const isDashboard = content.includes('CSS_TO_BE_INJECTED')
        if (isDashboard) {
          const modified = content.replace(
            /export const CSS_TO_BE_INJECTED = .*$/m,
            `export const CSS_TO_BE_INJECTED = \`${escapedCss}\``,
          )
          await writeFile(srcPath, modified, 'utf8')
        }

        // Simple scripts: inject GM_addStyle() call after the last import
        if (srcPath === entrypoint && !isDashboard) {
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

    // Build with bun
    const args = [
      'build',
      temporarySourceFile,
      '--target=browser',
      '--format=iife',
      `--outfile=${temporaryOutfile}`,
      '--sourcemap=none',
    ]
    if (!mode.debug) args.push('--minify')
    await $`bun ${args}`.quiet().throws(false)

    const bundle = await readFile(temporaryOutfile, 'utf8')

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

  // Snapshot all source files for restoration at the end
  const originals = await collectSourceFiles(srcDir)

  const hashes = new Map<string, string>()
  const built: string[] = []
  const errors: string[] = []

  try {
    // Phase 1: Build all debug scripts in parallel (original source, unminified)
    // Hash is computed from the debug bundle content.
    await Promise.all(
      entries.map(async (entrypoint) => {
        const name = basename(dirname(entrypoint))
        const prodFile = `dist/${name}.user.js`
        const prevHash = readExistingHash(prodFile) ?? ''

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

    // Phase 2: If any script changed, strip console once, then build prod.
    // Stripping is done once globally (idempotent) before any prod build.
    const hasChanges = entries.some((entrypoint) => {
      const name = basename(dirname(entrypoint))
      const hash = hashes.get(name)
      if (!hash) return false
      return readExistingHash(`dist/${name}.user.js`) !== hash
    })

    if (hasChanges) {
      for (const [path, content] of originals) {
        const stripped = stripConsoleFromSource(content)
        if (stripped !== content) await writeFile(path, stripped, 'utf8')
      }
    }

    await Promise.all(
      entries.map(async (entrypoint) => {
        const name = basename(dirname(entrypoint))
        const hash = hashes.get(name)
        if (!hash) return
        const prodFile = `dist/${name}.user.js`
        if (readExistingHash(prodFile) === hash) return

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
  } finally {
    await restoreSourceFiles(originals)
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
