import { Database } from 'bun:sqlite'
import { homedir, platform } from 'os'
import { join } from 'path'

function getDbPath(): string {
  const home = homedir()
  if (platform() === 'darwin') {
    return join(home, 'Library/Application Support/Antigravity/User/globalStorage/state.vscdb')
  } else if (platform() === 'win32') {
    return join(
      process.env.APPDATA || join(home, 'AppData/Roaming'),
      'Antigravity/User/globalStorage/state.vscdb',
    )
  } else {
    return join(home, '.config/Antigravity/User/globalStorage/state.vscdb')
  }
}

function readVarint(data: Buffer, offset: number) {
  let result = 0,
    shift = 0,
    pos = offset
  while (pos < data.length) {
    const byte = data[pos++]
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) break
    shift += 7
  }
  return { value: result >>> 0, newOffset: pos }
}

function skipField(data: Buffer, offset: number, wireType: number): number {
  if (wireType === 0) return readVarint(data, offset).newOffset
  if (wireType === 1) return offset + 8
  if (wireType === 2) {
    const len = readVarint(data, offset)
    return len.newOffset + len.value
  }
  if (wireType === 5) return offset + 4
  throw new Error(`Unknown wire type ${wireType}`)
}

/** Extract a length-delimited (wire type 2) field by field number */
function findBytesField(data: Buffer, targetField: number): Buffer | null {
  let offset = 0
  while (offset < data.length) {
    const tag = readVarint(data, offset)
    const wireType = tag.value & 7
    const fieldNum = tag.value >> 3
    if (fieldNum === targetField && wireType === 2) {
      const len = readVarint(data, tag.newOffset)
      return data.subarray(len.newOffset, len.newOffset + len.value)
    }
    offset = skipField(data, tag.newOffset, wireType)
  }
  return null
}

try {
  const dbPath = getDbPath()
  console.error('DB:', dbPath)

  const db = new Database(dbPath, { readonly: true })
  const row = db
    .query(`SELECT value FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.oauthToken'`)
    .get() as { value: string } | null

  if (!row) {
    console.error('oauthToken not found in database.')
    process.exit(1)
  }

  // Step 1: base64 decode the DB value → outer protobuf
  const outer = Buffer.from(row.value, 'base64')
  console.error('Outer protobuf length:', outer.length)

  // Step 2: Field 1 → nested message
  const msg1 = findBytesField(outer, 1)
  if (!msg1) {
    console.error('Field 1 not found')
    process.exit(1)
  }
  console.error('Msg1 length:', msg1.length)

  // Step 3: Field 2 → inner message
  const msg2 = findBytesField(msg1, 2)
  if (!msg2) {
    console.error('Field 2 not found')
    process.exit(1)
  }
  console.error('Msg2 length:', msg2.length)

  // Step 4: Field 1 → base64-encoded token data
  const b64Blob = findBytesField(msg2, 1)
  if (!b64Blob) {
    console.error('Inner field 1 not found')
    process.exit(1)
  }

  const b64Str = b64Blob.toString('utf-8')
  console.error('Base64 length:', b64Str.length)
  console.error('Base64 prefix:', b64Str.slice(0, 40))

  // Step 5: base64 decode → final protobuf with tokens
  const tokenProto = Buffer.from(b64Str, 'base64')
  console.error('Token protobuf length:', tokenProto.length)

  // Try to find access_token and refresh_token
  // Based on anti-quota: field 1 = access_token, field 3 = refresh_token
  const accessToken = findBytesField(tokenProto, 1)
  const refreshToken = findBytesField(tokenProto, 3)

  console.error('---')
  if (accessToken) {
    const at = accessToken.toString('utf-8')
    console.error('Access token:', at.slice(0, 40) + '...')
  }
  if (refreshToken) {
    const rt = refreshToken.toString('utf-8')
    console.error('Refresh token:', rt.slice(0, 40) + '...')
    if (rt.startsWith('1//')) {
      console.log(rt)
    } else {
      console.error('Token does not start with 1//, full value:')
      console.log(rt)
    }
  } else {
    console.error('No refresh token found in field 3.')
    // Dump all fields for debugging
    console.error('Token proto hex:', tokenProto.subarray(0, 80).toString('hex'))
  }

  db.close()
} catch (e: any) {
  console.error('Error:', e.message)
  process.exit(1)
}
