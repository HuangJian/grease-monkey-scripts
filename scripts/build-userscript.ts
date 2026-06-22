import { mkdir, readFile, unlink, writeFile, opendir, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { $ } from 'bun'
import { bundle as bundleCss, transform } from 'lightningcss'

function stripConsoleFromSource(source: string): string {
  // Strip console.log(...) and console.debug(...) from TypeScript source.
  // Since source is unminified, each call is well-formatted with balanced parens.
  const CONSOLE_RE = /console\.(log|debug)\(/
  let result = source
  let match: RegExpExecArray | null

  while ((match = CONSOLE_RE.exec(result)) !== null) {
    const start = match.index
    const parenStart = match[0].length - 1 + start

    // Find matching ')' by counting balanced parens
    let depth = 1
    let i = parenStart + 1
    while (i < result.length && depth > 0) {
      const ch = result[i]!
      if (ch === '(') depth++
      else if (ch === ')') depth--
      i++
    }
    const callEnd = i

    // Consume trailing semicolon
    let end = callEnd
    if (end < result.length && result[end] === ';') end++

    // Consume preceding whitespace/newline so no blank lines are left
    let begin = start
    while (begin > 0 && (result[begin - 1] === ' ' || result[begin - 1] === '\t')) begin--
    // Also consume one preceding newline if present
    if (begin > 0 && result[begin - 1] === '\n') begin--

    result = result.slice(0, begin) + result.slice(end)
    CONSOLE_RE.lastIndex = begin
  }

  return result
}

async function collectSourceFiles(dir: string): Promise<Map<string, string>> {
  const originals = new Map<string, string>()
  const entries = await opendir(dir)
  for await (const entry of entries) {
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
  await entries.close()
  return originals
}

async function restoreSourceFiles(originals: Map<string, string>): Promise<void> {
  for (const [path, content] of originals) {
    await writeFile(path, content, 'utf8')
  }
}

/**
 * Parse CSS variable definitions from tokens.css content.
 * Returns a map like { '--gm-sp-color-text': '#1f2328', ... }
 */
function parseCssVariables(tokensCss: string): Map<string, string> {
  const vars = new Map<string, string>()
  // Match --name: value; (ignoring comments and whitespace)
  const re = /(--[a-z][a-z0-9-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tokensCss)) !== null) {
    vars.set(m[1]!, m[2]!.trim())
  }
  return vars
}

/**
 * Replace var(--gm-sp-xxx) references with actual values.
 * Handles nested var() references by resolving recursively.
 */
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

function composeOverlayCss(entryCssPath: string): string {
  // 1. Parse variable definitions from tokens.css (optional — not all scripts use it)
  const tokensPath = resolve(dirname(entryCssPath), 'tokens.css')
  let vars = new Map<string, string>()
  try {
    const tokensCss = readFileSync(tokensPath, 'utf8')
    vars = parseCssVariables(tokensCss)
  } catch {
    // tokens.css is optional; proceed without variable definitions
  }

  // 2. Use Lightning CSS bundle to resolve all @import rules
  const { code } = bundleCss({
    filename: entryCssPath,
    minify: false,
  })
  let bundled = code.toString()

  // 3. Replace var(--gm-sp-xxx) with actual values from tokens.css
  bundled = resolveVarReferences(bundled, vars)

  // 4. Remove :host rule (variables are now inlined, no need for :host)
  bundled = bundled.replace(/:host\s*\{[^}]*\}/g, '')

  return bundled
}

function minifyCss(css: string): string {
  // Lightning CSS transform for high-quality minification
  const { code } = transform({
    filename: 'minified.css',
    code: Buffer.from(css),
    minify: true,
  })
  return code.toString()
}

const BUILD_MODES = [
  { suffix: '.debug.js', debug: true },
  { suffix: '.user.js', debug: false },
] as const

type BuildMode = (typeof BUILD_MODES)[number]

async function buildUserScript(
  entrypoint: string,
  mode: BuildMode,
  buildHash: string,
): Promise<void> {
  const name = basename(dirname(entrypoint))

  const entrypointSource = await readFile(entrypoint, 'utf8')

  const metadataMatch = entrypointSource.match(
    /^\/\/ ==UserScript==\n[\s\S]*?^\/\/ ==\/UserScript==/m,
  )
  const metadata = metadataMatch ? metadataMatch[0] : null

  if (!metadata) {
    throw new Error(`Missing userscript metadata block in ${entrypoint}`)
  }

  const buildMetaMatch = entrypointSource.match(
    /^\/\/ ==build.meta==\n[\s\S]*?^\/\/ ==\/build.meta==/m,
  )
  const buildMeta: Record<string, string> = {}
  if (buildMetaMatch) {
    const lines = buildMetaMatch[0].split('\n').slice(1, -1)
    for (const line of lines) {
      const lineTrimmed = line.trim()
      if (lineTrimmed.startsWith('// ')) {
        const content = lineTrimmed.slice(3)
        const [key, value] = content.split(':').map((s) => s.trim())
        if (key && value) buildMeta[key] = value
      }
    }
  }
  const baseSource = entrypointSource.replace(buildMetaMatch ? buildMetaMatch[0] : '', '')

  await mkdir('dist', { recursive: true })

  const outfile = `dist/${name}${mode.suffix}`
  const temporaryOutfile = `dist/.${name}${mode.debug ? '.debug' : '.prod'}.bundle.js`
  const temporarySourceFile = join(
    dirname(entrypoint),
    `.index${mode.debug ? '' : '.prod'}.user.ts`,
  )

  await writeFile(temporarySourceFile, baseSource, 'utf8')

  let bundle = ''
  const captured: string[] = []
  try {
    const buildCmd = mode.debug
      ? $`bun build ${temporarySourceFile} --target=browser --format=iife --outfile=${temporaryOutfile} --sourcemap=none`
      : $`bun build ${temporarySourceFile} --target=browser --format=iife --outfile=${temporaryOutfile} --sourcemap=none --minify`
    const buildResult = await buildCmd.quiet().throws(false)
    if (buildResult.stderr) captured.push(buildResult.stderr.toString())
    if (buildResult.exitCode !== 0) {
      throw new Error(`bun build exited with code ${buildResult.exitCode}`)
    }

    bundle = await readFile(temporaryOutfile, 'utf8')

    if (buildMeta.css && buildMeta.placeholder) {
      const cssPath = resolve(dirname(entrypoint), buildMeta.css)
      if (mode.debug) {
        // Debug: bundle CSS but keep variables for runtime theming
        const { code } = bundleCss({ filename: cssPath, minify: false })
        const escapedCss = code.toString().replace(/`/g, '\\`').replace(/\$/g, '\\$')
        bundle = bundle.replace(buildMeta.placeholder, escapedCss)
      } else {
        // Prod: bundle + resolve variables to static values + minify
        const css = await composeOverlayCss(cssPath)
        const processedCss = minifyCss(css)
        const escapedCss = processedCss.replace(/`/g, '\\`').replace(/\$/g, '\\$')
        bundle = bundle.replace(buildMeta.placeholder, escapedCss)
      }
    }

    bundle = bundle.replace(/^\/\/ ==build.meta==\n[\s\S]*?^\/\/ ==\/build.meta==\n/m, '')

    await writeFile(outfile, `${metadata}\n\n${bundle}\n// build ${buildHash}`)
    const { size } = await stat(outfile)
    console.log(`  ✓ ${outfile}  ${(size / 1024).toFixed(1)} KB`)
  } catch (error) {
    if (captured.length) process.stderr.write(captured.join(''))
    throw error
  } finally {
    await unlink(temporaryOutfile).catch(() => {})
    await unlink(temporarySourceFile).catch(() => {})
  }
}

async function main() {
  const buildHash = randomBytes(4).toString('hex')
  const srcDir = 'src'
  const entries = []

  const dir = await opendir(srcDir)
  for await (const dirent of dir) {
    if (dirent.isDirectory()) {
      const entryPoint = join(srcDir, dirent.name, 'index.user.ts')
      try {
        await stat(entryPoint)
        entries.push(entryPoint)
      } catch {
        // No index.user.ts, skip
      }
    }
  }
  await dir.close()

  if (entries.length === 0) {
    console.log('No index.user.ts files found in src subdirectories')
    return
  }

  // Pass 1: build the .debug.js variants with console.debug/log kept
  // intact. Stripping happens in pass 2 so the debug bundles can be
  // installed for ad-hoc troubleshooting without re-editing sources.
  console.log(`Building ${entries.length} script(s) (debug):`)
  for (const entrypoint of entries) {
    try {
      await buildUserScript(entrypoint, BUILD_MODES[0], buildHash)
    } catch (error) {
      console.error(`  ✗ ${basename(dirname(entrypoint))}:`, error)
    }
  }

  // Strip console.log/debug from source files before the prod build.
  // We rewrite source in place and restore afterwards. The build script
  // is the only thing that ever sees the stripped form.
  console.log('\nStripping console.log/debug from source for prod build...')
  const originals = await collectSourceFiles(srcDir)
  for (const [path, content] of originals) {
    const stripped = stripConsoleFromSource(content)
    if (stripped !== content) {
      await writeFile(path, stripped, 'utf8')
    }
  }

  try {
    // Pass 2: build the .user.js variants (minified, no debug/log).
    console.log(`\nBuilding ${entries.length} script(s) (prod):`)
    for (const entrypoint of entries) {
      try {
        await buildUserScript(entrypoint, BUILD_MODES[1], buildHash)
      } catch (error) {
        console.error(`  ✗ ${basename(dirname(entrypoint))}:`, error)
      }
    }
  } finally {
    console.log('\nRestoring source files...')
    await restoreSourceFiles(originals)
  }

  console.log(`\nBuild hash: ${buildHash}`)
}

main().catch(console.error)
