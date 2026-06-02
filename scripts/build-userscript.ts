import { mkdir, readFile, unlink, writeFile, opendir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { $ } from 'bun'

function stripConsoleCalls(bundle: string): string {
  return bundle
    .replace(/console\.(log|debug|error)\(\)/g, 'void 0')
    .replace(/console\.(log|debug|error)\(/g, '(void 0,')
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

async function buildUserScript(entrypoint: string): Promise<void> {
  const name = dirname(entrypoint).split('/').pop()!

  const entrypointSource = await readFile(entrypoint, 'utf8')

  // Extract userscript metadata
  const metadataMatch = entrypointSource.match(
    /^\/\/ ==UserScript==\n[\s\S]*?^\/\/ ==\/UserScript==/m,
  )
  const metadata = metadataMatch ? metadataMatch[0] : null

  if (!metadata) {
    throw new Error(`Missing userscript metadata block in ${entrypoint}`)
  }

  // Extract build.meta block
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
        if (key && value) {
          buildMeta[key] = value
        }
      }
    }
  }
  const baseSource = entrypointSource.replace(buildMetaMatch ? buildMetaMatch[0] : '', '')

  await mkdir('dist', { recursive: true })

  for (const mode of BUILD_MODES) {
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

      if (!mode.debug) {
        bundle = stripConsoleCalls(bundle)
      }

      if (buildMeta.css && buildMeta.placeholder) {
        const css = await readFile(buildMeta.css, 'utf8')
        const processedCss = mode.debug ? css.trim() : minifyCss(css)
        const escapedCss = processedCss.replace(/`/g, '\\`').replace(/\$/g, '\\$')
        bundle = bundle.replace(buildMeta.placeholder, escapedCss)
      }

      bundle = bundle.replace(/^\/\/ ==build.meta==\n[\s\S]*?^\/\/ ==\/build.meta==\n/m, '')

      await writeFile(outfile, `${metadata}\n\n${bundle}`)
      console.log(`  ✓ ${outfile}`)
    } finally {
      await unlink(temporaryOutfile).catch(() => {})
      await unlink(temporarySourceFile).catch(() => {})
    }
  }
}

async function main() {
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

  console.log(`Building ${entries.length} script(s):`)
  for (const entrypoint of entries) {
    console.log(`\n${dirname(entrypoint).split('/').pop()}:`)
    try {
      await buildUserScript(entrypoint)
    } catch (error) {
      console.error(`  ✗ Failed:`, error)
    }
  }
}

main().catch(console.error)
