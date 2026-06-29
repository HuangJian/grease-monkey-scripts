import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, within } from '@testing-library/preact'
import { createTnewsEditor } from '../../../../src/prism/tnews/editor'
import type { TnewsSourceOptions } from '../../../../src/prism/tnews/types'
import { DEFAULT_SOURCE_SETTINGS } from '../../../../src/prism/types'
import { createRuntime, type TestRuntime } from '../../../runtime'

afterEach(cleanup)

const DEFAULT_OPTS: TnewsSourceOptions = {
  ttlMinutes: 30,
}

async function setup(
  runtime: TestRuntime = createRuntime(),
  options: TnewsSourceOptions = DEFAULT_OPTS,
) {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  const close = () => root.replaceChildren()
  const editor = createTnewsEditor(options, DEFAULT_SOURCE_SETTINGS)
  const result = await editor(root, { runtime, onRevert: () => {}, close })
  return { runtime, root, close, result }
}

describe('createTnewsEditor', () => {
  test('renders ttl input', async () => {
    const { root } = await setup()
    expect((within(root).getByLabelText('TTL（分钟）') as HTMLInputElement).value).toBe('30')
  })

  test('rejects ttlMinutes <= 0 on save', async () => {
    const { root, result } = await setup()
    const ttl = within(root).getByLabelText('TTL（分钟）') as HTMLInputElement
    ttl.value = '0'
    void result.save?.()
    expect(within(root).getByText('TTL 必须是 ≥1 的整数')).not.toBeNull()
  })

  test('saves valid ttl to CONFIG_KEY and closes', async () => {
    const { runtime, root, result } = await setup()
    const ttl = within(root).getByLabelText('TTL（分钟）') as HTMLInputElement
    ttl.value = '45'
    void result.save?.()
    await new Promise((r) => setTimeout(r, 100))
    const cfg = runtime.stores['dashboard:v2:config'] as { tnews: TnewsSourceOptions } | undefined
    expect(cfg?.tnews.ttlMinutes).toBe(45)
  })

  test('loads existing ttl from CONFIG_KEY on open', async () => {
    const runtime = createRuntime()
    runtime.stores['dashboard:v2:config'] = {
      tnews: { ttlMinutes: 45 },
    }
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    const editor = createTnewsEditor(DEFAULT_OPTS, DEFAULT_SOURCE_SETTINGS)
    await editor(root, { runtime, onRevert: () => {}, close: () => {} })
    expect((within(root).getByLabelText('TTL（分钟）') as HTMLInputElement).value).toBe('45')
  })

  test('cancel button closes without saving', async () => {
    const { runtime, result } = await setup()
    const initialConfig = runtime.stores['dashboard:v2:config']
    result.cancel?.()
    expect(runtime.stores['dashboard:v2:config']).toBe(initialConfig)
  })
})
