import { mkdir, readFile, unlink, writeFile, opendir, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { $ } from 'bun'

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
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
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

function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim()
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
  try {
    const buildCmd = mode.debug
      ? $`bun build ${temporarySourceFile} --target=browser --format=iife --outfile=${temporaryOutfile} --sourcemap=none`
      : $`bun build ${temporarySourceFile} --target=browser --format=iife --outfile=${temporaryOutfile} --sourcemap=none --minify`
    await buildCmd

    bundle = await readFile(temporaryOutfile, 'utf8')

    if (buildMeta.css && buildMeta.placeholder) {
      const css = await readFile(buildMeta.css, 'utf8')
      const processedCss = mode.debug ? css.trim() : minifyCss(css)
      const escapedCss = processedCss.replace(/`/g, '\\`').replace(/\$/g, '\\$')
      bundle = bundle.replace(buildMeta.placeholder, escapedCss)
    }

    bundle = bundle.replace(/^\/\/ ==build.meta==\n[\s\S]*?^\/\/ ==\/build.meta==\n/m, '')

    await writeFile(outfile, `${metadata}\n\n${bundle}\n// build ${buildHash}`)
    console.log(`  ✓ ${outfile}`)
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
    console.log(`\n${basename(dirname(entrypoint))}:`)
    try {
      await buildUserScript(entrypoint, BUILD_MODES[0], buildHash)
    } catch (error) {
      console.error(`  ✗ Failed:`, error)
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
      console.log(`\n${basename(dirname(entrypoint))}:`)
      try {
        await buildUserScript(entrypoint, BUILD_MODES[1], buildHash)
      } catch (error) {
        console.error(`  ✗ Failed:`, error)
      }
    }
  } finally {
    console.log('\nRestoring source files...')
    await restoreSourceFiles(originals)
  }

  console.log(`\nBuild hash: ${buildHash}`)
}

main().catch(console.error)
