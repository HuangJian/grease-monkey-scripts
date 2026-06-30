/**
 * Parallel check runner.
 *
 * Runs typecheck, lint, format-check, and test concurrently, then build
 * sequentially (build mutates source files). Reports per-step timing and
 * output for failures.
 */

import { spawn, execSync } from 'child_process'
import { resolve, extname } from 'node:path'
import { existsSync } from 'node:fs'

const CWD = resolve(import.meta.dir, '..')
const BIN = resolve(CWD, 'node_modules/.bin')
const ENV = { ...process.env, PATH: `${BIN}:${process.env.PATH ?? ''}` }

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
        output: Buffer.concat(chunks).toString().trim(),
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

  const parallelSteps: Step[] = [
    { name: 'typecheck', cmd: 'tsc', args: ['--noEmit', '--incremental'] },
  ]

  if (changedFiles.length > 0) {
    parallelSteps.push(
      { name: 'lint', cmd: 'oxlint', args: changedFiles },
      {
        name: 'format',
        cmd: 'oxfmt',
        args: ['--check', ...changedFiles, '--disable-nested-config', '-c', './.oxfmtrc.json'],
      },
    )
  }

  parallelSteps.push({
    name: 'test',
    cmd: 'bun',
    args: ['run', 'scripts/test-silent.ts'],
    showOutput: true,
  })

  const stepNames = parallelSteps.map((s) => s.name).join(' · ')
  const skipNote = changedFiles.length === 0 ? ' (lint/format skipped: no changed files)' : ''
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
  const buildResult = await run({
    name: 'build',
    cmd: 'bun',
    args: ['run', 'scripts/build-userscript.ts'],
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
