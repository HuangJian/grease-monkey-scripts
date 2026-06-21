/**
 * Trae quota API test script.
 *
 * Reads auth from Trae storage.json (handles dGMF byteCrypto encryption),
 * falls back to log extraction, then calls the entitlement API.
 *
 * Usage:
 *   bun run scripts/trae-test.ts
 *   TRAE_TOKEN=<jwt> bun run scripts/trae-test.ts
 *   TRAE_STORAGE_PATH=/path bun run scripts/trae-test.ts
 */

import { createHash, createDecipheriv } from 'node:crypto'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

const DEFAULT_HOST = 'https://api-sg-central.trae.ai'

// ---- byteCrypto (dGMF prefix) - ported from traehop ----
// Header: 't' 'c' 0x05 0x10 0x00 0x00  (6 bytes)
const HEADER_LEN = 6
const KEY_LEN = 32
const AES128 = 16
const HASH_LEN = 64
const SALT_LEN = 64

const eX = Buffer.from([
  191, 192, 216, 250, 122, 246, 220, 97, 31, 254, 98, 27, 8, 72, 71, 176, 135, 99, 96, 18, 127, 101,
  203, 104, 211, 102, 191, 125, 37, 72, 150, 156, 51, 229, 121, 35, 17, 153, 141, 177, 110, 131,
  150, 128, 172, 255, 254, 6, 18, 140, 55, 62, 236, 249, 135, 64, 135, 12, 117, 4, 89, 149, 168,
  209,
])
const tX = Buffer.from([
  246, 204, 26, 232, 232, 70, 129, 109, 223, 146, 169, 242, 23, 241, 105, 145, 50, 196, 165, 42,
  254, 120, 3, 54, 244, 207, 209, 85, 53, 6, 138, 106, 175, 148, 31, 204, 186, 186, 165, 182, 87,
  142, 49, 10, 39, 110, 26, 154, 86, 56, 173, 125, 18, 64, 198, 225, 99, 99, 83, 82, 191, 134, 76,
  170,
])
const iX = Buffer.from([
  82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251, 124, 227, 57, 130, 155,
  47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203, 84, 123, 148, 50, 166, 194, 35, 61, 238, 76,
  149, 11, 66, 250, 195, 78, 8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37,
])
const rX = Buffer.from([
  31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95, 96, 81, 127, 169, 25, 181,
  74, 13, 45, 229, 122, 159, 147, 201, 156, 239, 160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187,
  60, 131, 83, 153, 97, 23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125,
])

function deriveSalt(version: number): Buffer {
  return version === 2
    ? Buffer.from(eX.map((b, i) => b ^ tX[i]))
    : Buffer.from(iX.map((b, i) => b ^ rX[i]))
}

function sha512(data: Buffer): Buffer {
  return createHash('sha512').update(data).digest()
}

/** Decrypt a dGMF-prefixed byteCrypto value. Layout: 6-byte header + 32-byte key material + ciphertext */
function decryptByteCrypto(encoded: string): string {
  const raw = Buffer.from(encoded, 'base64')
  const hex = raw.subarray(0, 16).toString('hex')
  const version = raw[4]
  const keyMaterial = raw.subarray(HEADER_LEN, HEADER_LEN + KEY_LEN)
  const ciphertext = raw.subarray(HEADER_LEN + KEY_LEN)
  console.error(
    `  dGMF debug: len=${raw.length} header_hex=${hex} version=${version} keyMatLen=${keyMaterial.length} ctLen=${ciphertext.length}`,
  )
  console.error(`  dGMF keyMaterial hex: ${keyMaterial.toString('hex')}`)
  // If the decrypted output is still garbage, it may be that the v10/Keychain format is being used
  // Try alternative: maybe header is 4 bytes, key is 16 bytes
  // Actually, also try treating it as direct AES-128-CBC with IV from bytes 4-8 and key from bytes 8-24
  console.error(`  raw[0..3]: ${raw.subarray(0, 4).toString()} raw[4]=${raw[4]} raw[5]=${raw[5]}`)
  console.error(`  raw[6..21] (possible key?): ${raw.subarray(6, 22).toString('hex')}`)
  console.error(`  raw[22..37] (possible iv?): ${raw.subarray(22, 38).toString('hex')}`)
  const salt = deriveSalt(version)

  const buf = Buffer.alloc(HASH_LEN + SALT_LEN)
  sha512(keyMaterial).copy(buf, 0)
  salt.copy(buf, HASH_LEN)
  sha512(buf).copy(buf, 0)
  const aesKey = buf.subarray(0, AES128)
  const iv = buf.subarray(AES128, AES128 + AES128)
  const decipher = createDecipheriv('aes-128-cbc', aesKey, iv)
  decipher.setAutoPadding(true)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

// ---- helpers ----
function getStoragePaths(): string[] {
  const home = homedir()
  if (platform() === 'darwin') {
    return [
      join(home, 'Library/Application Support/Trae/User/globalStorage/storage.json'),
      join(home, 'Library/Application Support/Trae SOLO/User/globalStorage/storage.json'),
    ]
  }
  if (platform() === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming')
    return [join(appData, 'Trae/User/globalStorage/storage.json')]
  }
  return []
}

function findLogToken(): { token: string; source: string } | null {
  const home = homedir()
  const logDirs: string[] = []
  if (platform() === 'darwin') {
    logDirs.push(
      join(home, 'Library/Application Support/Trae/logs'),
      join(home, 'Library/Application Support/Trae SOLO/logs'),
    )
  }
  for (const dir of logDirs) {
    if (!existsSync(dir)) continue
    for (const sub of readdirSync(dir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue
      const logFile = join(dir, sub.name, 'main.log')
      if (!existsSync(logFile)) continue
      const content = readFileSync(logFile, 'utf8')
      const m = content.match(/"UserJwt":"(eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)"/)
      if (m?.[1]) return { token: m[1], source: logFile }
    }
  }
  return null
}

function parseAuthData(storagePath: string): { token: string; host: string } {
  const storage = JSON.parse(readFileSync(storagePath, 'utf8'))
  const raw: unknown = storage['iCubeAuthInfo://icube.cloudide']
  if (!raw) throw new Error('Key iCubeAuthInfo://icube.cloudide not found in storage.json')

  let jsonStr: string
  if (typeof raw === 'string' && raw.startsWith('{')) {
    jsonStr = raw
  } else if (typeof raw === 'string' && raw.startsWith('dGMF')) {
    jsonStr = decryptByteCrypto(raw)
  } else if (typeof raw === 'string') {
    const buf = Buffer.from(raw, 'base64')
    const prefix = buf.subarray(0, 3).toString()
    if (prefix === 'v10') {
      throw new Error('djEw/v10 encrypted token needs macOS Keychain. Use log extraction instead.')
    }
    throw new Error(`Unknown encryption format, prefix: ${raw.slice(0, 10)}`)
  } else {
    jsonStr = JSON.stringify(raw)
  }

  const auth = JSON.parse(jsonStr)
  if (!auth.token) throw new Error('No token in auth data')
  return {
    token: auth.token,
    host: auth.host || DEFAULT_HOST,
  }
}

function tryExtractToken(): { token: string; host: string } {
  // 1. Try storage.json
  for (const path of getStoragePaths()) {
    if (!existsSync(path)) continue
    console.error(`Reading auth from: ${path}`)
    try {
      return parseAuthData(path)
    } catch (e: any) {
      console.error(`  storage.json parse failed: ${e.message}`)
    }
  }

  // 2. Try log extraction
  const logToken = findLogToken()
  if (logToken) {
    console.error(`Token extracted from: ${logToken.source}`)
    return { token: logToken.token, host: DEFAULT_HOST }
  }

  throw new Error(
    'Could not find Trae auth. Provide TRAE_TOKEN env var, or ensure Trae IDE has been used recently.',
  )
}

// ---- main ----
async function main() {
  const token = process.env.TRAE_TOKEN
  let host = process.env.TRAE_HOST || DEFAULT_HOST

  let authToken: string
  if (token) {
    console.error('Using TRAE_TOKEN from env')
    authToken = token
  } else {
    const extracted = tryExtractToken()
    authToken = extracted.token
    host = extracted.host
  }

  console.error('')
  console.error(`Host: ${host}`)
  console.error(`Token: ${authToken.slice(0, 20)}... (${authToken.length} chars)`)
  console.error('')
  console.log('TRAE_TOKEN=' + authToken)
  console.log('')

  const resp = await fetch(`${host}/trae/api/v1/pay/user_current_entitlement_list`, {
    method: 'POST',
    headers: {
      Authorization: `Cloud-IDE-JWT ${authToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://www.trae.ai',
      Referer: 'https://www.trae.ai/',
    },
    body: JSON.stringify({ require_usage: true }),
  })

  console.error(`HTTP ${resp.status}`)
  console.error('')

  const body: any = await resp.json()
  console.log(JSON.stringify(body, null, 2))

  if (resp.ok) {
    console.error('')
    console.error('--- Summary ---')
    const packs = body.user_entitlement_pack_list ?? []
    const active = packs.filter((p: any) => p.status === 1)
    const target = active.length ? active[0] : packs[0]
    if (target) {
      const info = target.entitlement_base_info ?? {}
      const planMap: Record<number, string> = { 0: 'Free', 1: 'Pro', 2: 'Team', 3: 'Builder' }
      const plan = planMap[info.product_type] ?? `Unknown(${info.product_type})`
      console.error(`Plan: ${plan}`)
      const quota = info.quota ?? {}
      const usage = target.usage ?? {}
      const rows: [string, string, string][] = [
        ['Premium Fast', 'premium_model_fast_request_limit', 'premium_model_fast_amount'],
        ['Premium Slow', 'premium_model_slow_request_limit', 'premium_model_slow_amount'],
        ['Advanced Model', 'advanced_model_request_limit', 'advanced_model_amount'],
        ['Auto Completion', 'auto_completion_limit', 'auto_completion_amount'],
      ]
      for (const [name, qk, uk] of rows) {
        const lim = (quota[qk] as number) ?? 0
        const used = (usage[uk] as number) ?? 0
        console.error(
          `  ${name.padEnd(20)}: used=${String(used).padStart(3)}  limit=${String(lim).padStart(4)}  remain=${lim - used}`,
        )
      }
      if (info.end_time) {
        const dt = new Date(info.end_time * 1000)
        console.error(`  Reset: ${dt.toISOString().slice(0, 19).replace('T', ' ')}`)
      }
    }
    console.log('') // blank line before token for easy copy
    console.log('TRAE_TOKEN=' + authToken)
  } else {
    process.exit(1)
  }
}

main().catch((e: any) => {
  console.error(`Error: ${e.message}`)
  process.exit(1)
})
