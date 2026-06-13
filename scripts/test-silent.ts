import { spawn } from 'child_process'

const CWD = import.meta.dir + '/..'

function runBunTest(args: string[]): Promise<{ output: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn('bun', ['test', ...args], {
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: CWD,
    })
    const chunks: Buffer[] = []
    child.stdout!.on('data', (c: Buffer) => chunks.push(c))
    child.stderr!.on('data', (c: Buffer) => chunks.push(c))
    child.on('close', (code) => {
      resolve({ output: Buffer.concat(chunks).toString(), code: code ?? 1 })
    })
  })
}

function parseFailures(output: string): { file: string; testName: string }[] {
  const lines = output.split('\n')
  const fileRe = /^test[\\/](.*\.test\.[tj]sx?):/
  const failRe = /^\(fail\)\s+(.+?)\s+\[[\d.]+ms\]/
  const failures: { file: string; testName: string }[] = []
  let currentFile = ''
  for (const line of lines) {
    const t = line.trim()
    if (/^\d+ pass|^\d+ test.* failed/.test(t)) break
    const fm = t.match(fileRe)
    if (fm) {
      currentFile = fm[1]
      continue
    }
    const xm = t.match(failRe)
    if (xm && currentFile) {
      const full = xm[1]
      const testName = full.includes('>') ? full.split('>').pop()!.trim() : full
      failures.push({ file: `test/${currentFile}`, testName })
    }
  }
  return failures
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractSummary(output: string): string {
  const lines = output.split('\n')
  const idx = lines.findIndex((l) => /^\d+ pass/.test(l.trim()))
  if (idx === -1) return ''
  return lines.slice(idx).join('\n')
}

async function main() {
  const first = await runBunTest(process.argv.slice(2))
  const summary = extractSummary(first.output)
  const failures = parseFailures(first.output)

  if (failures.length === 0) {
    process.stdout.write('\n' + summary + '\n')
    process.exit(0)
  }

  process.stdout.write('\n' + summary + '\n')

  for (const f of failures) {
    process.stdout.write(`\n--- ${f.testName} ---\n\n`)
    const r = await runBunTest(['-t', escapeRegex(f.testName), f.file])
    process.stdout.write(r.output + '\n')
  }

  process.stdout.write('\nRun `bun run test:verbose` for full output.\n')
  process.exit(1)
}

main()
