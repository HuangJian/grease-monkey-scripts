import { mkdir, readFile, unlink, writeFile, opendir, stat } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { $ } from 'bun'
import { bundle as bundleCss, transform } from 'lightningcss'

function stripConsoleFromSource(source: string): string {
  const CONSOLE_RE = /console\.(log|debug)\(/
  let result = source
  let match: RegExpExecArray | null

  while ((match = CONSOLE_RE.exec(result)) !== null) {
    const start = match.index
    const parenStart = match[0].length - 1 + start

    let depth = 1
    let i = parenStart + 1
    while (i < result.length && depth > 0) {
      const ch = result[i]!
      if (ch === '(') depth++
      else if (ch === ')') depth--
      i++
    }
    const callEnd = i

    let end = callEnd
    if (end < result.length && result[end] === ';') end++

    let begin = start
    while (begin > 0 && (result[begin - 1] === ' ' || result[begin - 1] === '\t')) begin--
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

function parseCssVariables(tokensCss: string): Map<string, string> {
  const vars = new Map<string, string>()
  const re = /(--[a-z][a-z0-9-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tokensCss)) !== null) {
    vars.set(m[1]!, m[2]!.trim())
  }
  return vars
}

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

function minifyCss(css: string): string {
  const { code } = transform({
    filename: 'minified.css',
    code: Buffer.from(css),
    minify: true,
  })
  return code.toString()
}

/**
 * Build CSS from index.css and return the processed CSS string.
 * For debug mode, variables are resolved but output is not minified.
 * For prod mode, output is fully minified.
 */
function buildCss(scriptDir: string, debug: boolean): string {
  const indexCssPath = resolve(scriptDir, 'index.css')

  try {
    readFileSync(indexCssPath, 'utf8')
  } catch {
    return ''
  }

  // Resolve @import rules using Lightning CSS bundle
  const { code } = bundleCss({
    filename: indexCssPath,
    minify: false,
  })
  let css = code.toString()

  // Resolve CSS variables from tokens.css — search recursively in scriptDir
  const tokensPath = findTokensCss(scriptDir)
  if (tokensPath) {
    const tokensCss = readFileSync(tokensPath, 'utf8')
    const vars = parseCssVariables(tokensCss)
    css = resolveVarReferences(css, vars)
  }

  // Remove :host rule (variables are now inlined)
  css = css.replace(/:host\s*\{[^}]*\}/g, '')

  if (!debug) {
    css = minifyCss(css)
  }

  return css
}

function findTokensCss(dir: string): string | null {
  // Check current dir
  const direct = resolve(dir, 'tokens.css')
  try {
    readFileSync(direct, 'utf8')
    return direct
  } catch {}
  // Check one level of subdirectories
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nested = resolve(dir, entry.name, 'tokens.css')
        try {
          readFileSync(nested, 'utf8')
          return nested
        } catch {}
      }
    }
  } catch {}
  return null
}

/**
 * Escape a string for safe embedding in a JS template literal.
 */
function escapeForTemplateLiteral(css: string): string {
  return css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
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
  const scriptDir = dirname(entrypoint)

  const entrypointSource = await readFile(entrypoint, 'utf8')

  const metadataMatch = entrypointSource.match(
    /^\/\/ ==UserScript==\n[\s\S]*?^\/\/ ==\/UserScript==/m,
  )
  const metadata = metadataMatch ? metadataMatch[0] : null

  if (!metadata) {
    throw new Error(`Missing userscript metadata block in ${entrypoint}`)
  }

  await mkdir('dist', { recursive: true })

  const outfile = `dist/${name}${mode.suffix}`
  const temporaryOutfile = `dist/.${name}${mode.debug ? '.debug' : '.prod'}.bundle.js`

  // Build CSS from index.css
  const css = buildCss(scriptDir, mode.debug)

  // Collect original source files for restoration
  const originals = await collectSourceFiles(scriptDir)

  // Temporary files to clean up
  const tempFiles: string[] = []

  try {
    if (css) {
      // Generate .css-module.ts
      const cssModulePath = join(scriptDir, '.css-module.ts')
      const escapedCss = escapeForTemplateLiteral(css)
      await writeFile(cssModulePath, `export default \`${escapedCss}\`\n`, 'utf8')
      tempFiles.push(cssModulePath)

      const isDashboard = (content: string) => content.includes('CSS_TO_BE_INJECTED')

      // Inject CSS into source files
      for (const [srcPath, content] of originals) {
        let modified = content

        // Dashboard: replace CSS_TO_BE_INJECTED placeholder with actual CSS
        if (isDashboard(modified)) {
          modified = modified.replace(
            /export const CSS_TO_BE_INJECTED = .*$/m,
            `export const CSS_TO_BE_INJECTED = \`${escapedCss}\``,
          )
        }

        // Simple scripts: inject GM_addStyle into the entry file
        if (srcPath === entrypoint && !isDashboard(modified)) {
          const importStatement = "import __css from './.css-module'"
          // Insert import after the last existing import
          const importRe = /^import\s.+?;\n/gm
          let lastImportEnd = 0
          let im: RegExpExecArray | null
          while ((im = importRe.exec(modified)) !== null) {
            lastImportEnd = im.index + im[0].length
          }
          if (lastImportEnd > 0) {
            modified =
              modified.slice(0, lastImportEnd) +
              importStatement +
              '\n' +
              modified.slice(lastImportEnd)
          } else {
            modified = importStatement + '\n' + modified
          }
          // Inject GM_addStyle call before the app start call
          // Pattern: "void someApp(createBrowserRuntime())"
          modified = modified.replace(
            /void\s+(\w+)\(createBrowserRuntime\(\)\)/,
            'GM_addStyle(__css)\nvoid $1(createBrowserRuntime())',
          )
        }

        if (modified !== content) {
          await writeFile(srcPath, modified, 'utf8')
        }
      }
    }

    // Write temporary entrypoint (with ==build.meta== already removed from source)
    const baseSource = entrypointSource.replace(
      /^\/\/ ==build.meta==\n[\s\S]*?^\/\/ ==\/build.meta==\n/m,
      '',
    )
    const temporarySourceFile = join(scriptDir, `.index${mode.debug ? '' : '.prod'}.user.ts`)
    await writeFile(temporarySourceFile, baseSource, 'utf8')
    tempFiles.push(temporarySourceFile)

    const buildCmd = mode.debug
      ? $`bun build ${temporarySourceFile} --target=browser --format=iife --outfile=${temporaryOutfile} --sourcemap=none`
      : $`bun build ${temporarySourceFile} --target=browser --format=iife --outfile=${temporaryOutfile} --sourcemap=none --minify`
    const buildResult = await buildCmd.quiet().throws(false)
    if (buildResult.exitCode !== 0) {
      const stderr = buildResult.stderr?.toString() ?? ''
      throw new Error(`bun build exited with code ${buildResult.exitCode}\n${stderr}`)
    }

    const bundle = await readFile(temporaryOutfile, 'utf8')

    await writeFile(outfile, `${metadata}\n\n${bundle}\n// build ${buildHash}`)
    const { size } = await stat(outfile)
    console.log(`  ✓ ${outfile}  ${(size / 1024).toFixed(1)} KB`)
  } finally {
    // Restore original source files
    await restoreSourceFiles(originals)

    // Clean up temporary files
    for (const tmpFile of tempFiles) {
      await unlink(tmpFile).catch(() => {})
    }
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
      } catch {}
    }
  }
  await dir.close()

  if (entries.length === 0) {
    console.log('No index.user.ts files found in src subdirectories')
    return
  }

  console.log(`Building ${entries.length} script(s) (debug):`)
  for (const entrypoint of entries) {
    try {
      await buildUserScript(entrypoint, BUILD_MODES[0], buildHash)
    } catch (error) {
      console.error(`  ✗ ${basename(dirname(entrypoint))}:`, error)
    }
  }

  console.log('\nStripping console.log/debug from source for prod build...')
  const originals = await collectSourceFiles(srcDir)
  for (const [path, content] of originals) {
    const stripped = stripConsoleFromSource(content)
    if (stripped !== content) {
      await writeFile(path, stripped, 'utf8')
    }
  }

  try {
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
