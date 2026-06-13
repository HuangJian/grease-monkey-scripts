import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { loadConfigSection, validateConfig } from '../config'
import { readNumberFields, saveConfigSection } from '../editor-helpers'
import type { SourceEditor, SourceEditorContext, SourceEditorResult } from '../types'
import type { XueqiuSourceOptions } from './types'
import type { Runtime } from '../../runtime'

function coerceXueqiuOptions(
  raw: Record<string, unknown>,
  fallback: XueqiuSourceOptions,
): XueqiuSourceOptions {
  return {
    ttlMinutes:
      typeof raw['ttlMinutes'] === 'number' && Number.isFinite(raw['ttlMinutes'])
        ? (raw['ttlMinutes'] as number)
        : fallback.ttlMinutes,
    scrollWaitMs:
      typeof raw['scrollWaitMs'] === 'number' && Number.isFinite(raw['scrollWaitMs'])
        ? (raw['scrollWaitMs'] as number)
        : fallback.scrollWaitMs,
    scrollMaxNoChange:
      typeof raw['scrollMaxNoChange'] === 'number' && Number.isFinite(raw['scrollMaxNoChange'])
        ? (raw['scrollMaxNoChange'] as number)
        : fallback.scrollMaxNoChange,
  }
}

async function loadFreshOptions(
  runtime: Runtime,
  fallback: XueqiuSourceOptions,
): Promise<XueqiuSourceOptions> {
  return loadConfigSection(runtime, 'xueqiu', fallback, (raw) => coerceXueqiuOptions(raw, fallback))
}

type XueqiuEditorFormProps = {
  fresh: XueqiuSourceOptions
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function XueqiuEditorForm({ fresh, ctx, handleRef }: XueqiuEditorFormProps) {
  const [error, setError] = useState('')
  const [ttl, setTtl] = useState(fresh.ttlMinutes)
  const [scrollWait, setScrollWait] = useState(fresh.scrollWaitMs)
  const [scrollMax, setScrollMax] = useState(fresh.scrollMaxNoChange)
  const ttlRef = useRef<HTMLInputElement>(null)
  const scrollWaitRef = useRef<HTMLInputElement>(null)
  const scrollMaxRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      save() {
        setError('')
        const nums = readNumberFields(
          [
            { input: ttlRef.current!, min: 1, errorMessage: 'TTL 必须是 ≥1 的整数' },
            {
              input: scrollWaitRef.current!,
              min: 50,
              errorMessage: '等待时间必须是 50–5000 的整数',
            },
            { input: scrollMaxRef.current!, min: 1, errorMessage: '无变化次数必须是 1–100 的整数' },
          ],
          (msg) => setError(msg),
        )
        if (nums === null) return
        const xueqiu: XueqiuSourceOptions = {
          ttlMinutes: Math.round(nums[0]),
          scrollWaitMs: Math.round(nums[1]),
          scrollMaxNoChange: Math.round(nums[2]),
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'xueqiu',
          section: xueqiu,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => ctx.close(),
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [ttl, scrollWait, scrollMax])

  return (
    <div class="gm-sp-editor">
      <div class="gm-sp-editor-form">
        <label class="gm-sp-editor-row">
          <span>TTL（分钟）</span>
          <input
            ref={ttlRef}
            type="number"
            min="1"
            step="1"
            class="gm-sp-input"
            value={ttl}
            onInput={(e) => setTtl(Number((e.target as HTMLInputElement).value))}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>等待时间（毫秒）</span>
          <input
            ref={scrollWaitRef}
            type="number"
            min="50"
            max="5000"
            step="10"
            class="gm-sp-input"
            value={scrollWait}
            onInput={(e) => setScrollWait(Number((e.target as HTMLInputElement).value))}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>无变化次数上限</span>
          <input
            ref={scrollMaxRef}
            type="number"
            min="1"
            max="100"
            step="1"
            class="gm-sp-input"
            value={scrollMax}
            onInput={(e) => setScrollMax(Number((e.target as HTMLInputElement).value))}
          />
        </label>
      </div>
      <div class="gm-sp-editor-error" hidden={!error}>
        {error}
      </div>
    </div>
  )
}

export function createXueqiuEditor(options: XueqiuSourceOptions): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshOptions(ctx.runtime, options)
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(<XueqiuEditorForm fresh={fresh} ctx={ctx} handleRef={handleRef} />, container)
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
