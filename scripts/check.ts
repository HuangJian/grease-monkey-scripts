/**
 * Parallel check runner.
 *
 * Runs typecheck, lint, format-check, and test concurrently, then build
 * sequentially (build mutates source files). Reports per-step timing and
 * output for failures.
 *
 * Scope: typecheck always runs full-incremental (faster than a scoped config).
 * Test is scoped to the affected modules when changes are confined to
 * userscript modules (e.g. src/prism, test/prism); shared/global changes
 * trigger a full test run. Lint and format always run on changed files only.
 *
 * Pass --full to force lint, format, and test on the entire project, plus a
 * forced full rebuild (ignoring build hashes).
 */

import { spawn, execSync } from 'child_process'
import { resolve, extname } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'

const CWD = resolve(import.meta.dir, '..')
const BIN = resolve(CWD, 'node_modules/.bin')
const ENV = { ...process.env, PATH: `${BIN}:${process.env.PATH ?? ''}` }

const FORCE_FULL = process.argv.includes('--full')

/** Extensions oxfmt can format-check (broader than oxlint). */
const CHECKABLE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.md',
  '.yaml',
  '.yml',
])

/** Extensions oxlint can lint (JS/TS only). oxlint exits 1 when passed
 *  only non-JS/TS files (e.g. a lone package.json change). */
const LINTABLE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

/**
 * Get files changed vs HEAD (staged + unstaged) plus untracked files,
 * filtered to extensions oxlint/oxfmt can handle. Returns [] on git errors.
 */
function getChangedFiles(): string[] {
  try {
    const tracked = execSync('git diff --name-only HEAD --diff-filter=ACMR', {
      cwd: CWD,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean)
    const untracked = execSync('git ls-files --others --exclude-standard', {
      cwd: CWD,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean)
    return [...new Set([...tracked, ...untracked])]
      .filter((f) => CHECKABLE_EXTS.has(extname(f)))
      .filter((f) => existsSync(resolve(CWD, f)))
  } catch {
    return []
  }
}

/** Discover userscript modules: directories under src/ with an index.user.ts. */
function discoverModules(): Set<string> {
  const modules = new Set<string>()
  for (const entry of readdirSync(resolve(CWD, 'src'), { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(resolve(CWD, 'src', entry.name, 'index.user.ts'))) {
      modules.add(entry.name)
    }
  }
  return modules
}

type Scope = { mode: 'full'; reason: string } | { mode: 'scoped'; modules: string[] }

/**
 * Decide test scope based on changed files.
 *
 * - --full flag or no changed files → full.
 * - Any changed file outside a module's src/<m>/ or test/<m>/ tree (shared
 *   code, project globals) → full.
 * - Otherwise → scoped to the affected modules.
 */
function determineTestScope(changedFiles: string[], modules: Set<string>): Scope {
  if (FORCE_FULL) return { mode: 'full', reason: '--full flag' }
  if (changedFiles.length === 0) return { mode: 'full', reason: 'no changes' }

  const affected = new Set<string>()
  for (const file of changedFiles) {
    const [root, module] = file.split('/')
    if ((root === 'src' || root === 'test') && module && modules.has(module)) {
      affected.add(module)
    } else {
      return { mode: 'full', reason: `shared/global change: ${file}` }
    }
  }
  return { mode: 'scoped', modules: [...affected].sort() }
}

interface Step {
  name: string
  cmd: string
  args: string[]
  /** Always print output even on success (e.g. test summary, build result). */
  showOutput?: boolean
}

interface Result {
  name: string
  ok: boolean
  ms: number
  output: string
  showOutput?: boolean
}

function run(step: Step): Promise<Result> {
  return new Promise((resolveResult) => {
    const start = performance.now()
    const child = spawn(step.cmd, step.args, {
      cwd: CWD,
      env: ENV,
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    child.stdout!.on('data', (c: Buffer) => chunks.push(c))
    child.stderr!.on('data', (c: Buffer) => chunks.push(c))
    child.on('close', (code) => {
      resolveResult({
        name: step.name,
        ok: code === 0,
        ms: performance.now() - start,
        output: Buffer.concat(chunks).toString(),
        showOutput: step.showOutput,
      })
    })
  })
}

function printResult(r: Result): void {
  const icon = r.ok ? '✓' : '✗'
  const secs = (r.ms / 1000).toFixed(1)
  console.log(`${icon} ${r.name} (${secs}s)`)
  if (r.output && (!r.ok || r.showOutput)) {
    // Indent output under the step header
    for (const line of r.output.split('\n')) {
      console.log(`  ${line}`)
    }
    console.log('')
  }
}

async function main() {
  const totalStart = performance.now()

  const changedFiles = getChangedFiles()
  const modules = discoverModules()
  const testScope = determineTestScope(changedFiles, modules)

  // --- Build parallel steps ------------------------------------------------

  const parallelSteps: Step[] = []

  // typecheck: full-incremental (faster than a scoped tsconfig).
  // Skipped when there are no changes and --full is not set.
  if (FORCE_FULL || changedFiles.length > 0) {
    parallelSteps.push({ name: 'typecheck', cmd: 'tsc', args: ['--noEmit', '--incremental'] })
  }

  // lint: changed JS/TS files, or the whole project with --full.
  if (FORCE_FULL) {
    parallelSteps.push({ name: 'lint', cmd: 'oxlint', args: ['.'] })
  } else {
    const lintableFiles = changedFiles.filter((f) => LINTABLE_EXTS.has(extname(f)))
    if (lintableFiles.length > 0) {
      parallelSteps.push({ name: 'lint', cmd: 'oxlint', args: lintableFiles })
    }
  }

  // format-check: changed files, or the whole project with --full.
  if (FORCE_FULL) {
    parallelSteps.push({
      name: 'format',
      cmd: 'oxfmt',
      args: ['.', '--disable-nested-config', '-c', './.oxfmtrc.json'],
    })
  } else if (changedFiles.length > 0) {
    parallelSteps.push({
      name: 'format',
      cmd: 'oxfmt',
      args: [...changedFiles, '--disable-nested-config', '-c', './.oxfmtrc.json'],
    })
  }

  // test: scoped to changed modules, or full project with --full / shared changes.
  // Skipped when there are no changes and --full is not set.
  if (FORCE_FULL || changedFiles.length > 0) {
    const testArgs =
      testScope.mode === 'scoped'
        ? ['run', 'scripts/test-silent.ts', ...testScope.modules.map((m) => `test/${m}`)]
        : ['run', 'scripts/test-silent.ts']
    parallelSteps.push({ name: 'test', cmd: 'bun', args: testArgs, showOutput: true })
  }

  // --- Header --------------------------------------------------------------

  const noChanges = changedFiles.length === 0
  const scopeLabel = FORCE_FULL
    ? 'full (--full)'
    : noChanges
      ? 'no changes'
      : testScope.mode === 'scoped'
        ? `test scoped (${testScope.modules.join(', ')})`
        : `full (${testScope.reason})`
  const stepNames =
    parallelSteps.length > 0 ? parallelSteps.map((s) => s.name).join(' · ') : 'nothing'
  const skipped: string[] = []
  if (!FORCE_FULL && noChanges) {
    skipped.push('typecheck', 'lint', 'format', 'test')
  } else if (!FORCE_FULL) {
    const lintableFiles = changedFiles.filter((f) => LINTABLE_EXTS.has(extname(f)))
    if (lintableFiles.length === 0) skipped.push('lint')
  }
  const skipNote = skipped.length > 0 ? ` (skipped: ${skipped.join(', ')})` : ''
  console.log(`Scope: ${scopeLabel}`)
  console.log(`Running ${stepNames} in parallel…${skipNote}\n`)

  const results: Result[] = []

  // Print each result as it completes
  await Promise.all(
    parallelSteps.map(async (step) => {
      const r = await run(step)
      printResult(r)
      results.push(r)
    }),
  )

  // Build runs after parallel steps — it mutates source files temporarily.
  const buildArgs = FORCE_FULL
    ? ['run', 'scripts/build-userscript.ts', '--full']
    : ['run', 'scripts/build-userscript.ts']
  const buildResult = await run({
    name: 'build',
    cmd: 'bun',
    args: buildArgs,
    showOutput: true,
  })
  printResult(buildResult)
  results.push(buildResult)

  const allOk = results.every((r) => r.ok)
  const totalSecs = ((performance.now() - totalStart) / 1000).toFixed(1)
  console.log(
    allOk
      ? `\n✓ All checks passed in ${totalSecs}s`
      : `\n✗ ${results
          .filter((r) => !r.ok)
          .map((r) => r.name)
          .join(', ')} failed in ${totalSecs}s`,
  )
  process.exit(allOk ? 0 : 1)
}

main()
