import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { loadConfigSection, validateConfig } from '../config'
import { saveConfigSection, saveSourceSettings } from '../editor-helpers'
import { SourceSettingsFields } from '../editor-ui'
import type {
  SourceEditor,
  SourceEditorContext,
  SourceEditorResult,
  SourceSettings,
} from '../types'
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
  sourceId: string
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function XueqiuEditorForm({ fresh, sourceId, settings, ctx, handleRef }: XueqiuEditorFormProps) {
  const [error, setError] = useState('')
  const [ttl, setTtl] = useState(fresh.ttlMinutes)
  const [tabTitle, setTabTitle] = useState(settings.tabTitle)
  const [priority, setPriority] = useState(settings.priority)
  const [badgeType, setBadgeType] = useState(settings.badgeType)
  const ttlRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      save() {
        setError('')
        const val = ttlRef.current?.value
        const ttlNum = val !== undefined ? Number(val) : NaN
        if (!Number.isFinite(ttlNum) || ttlNum < 1 || Math.round(ttlNum) !== ttlNum) {
          setError('TTL 必须是 ≥1 的整数')
          return
        }
        const xueqiu: XueqiuSourceOptions = { ttlMinutes: ttlNum }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'xueqiu',
          section: xueqiu,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, sourceId, { tabTitle, priority, badgeType })
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [ttl, tabTitle, priority, badgeType])

  return (
    <div class="gm-sp-editor">
      <SourceSettingsFields
        tabTitle={tabTitle}
        onTabTitleChange={setTabTitle}
        priority={priority}
        onPriorityChange={setPriority}
        badgeType={badgeType}
        onBadgeTypeChange={setBadgeType}
      />
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
      </div>
      <div class="gm-sp-editor-error" hidden={!error}>
        {error}
      </div>
    </div>
  )
}

export function createXueqiuEditor(
  options: XueqiuSourceOptions,
  sourceId: string,
  settings: SourceSettings,
): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshOptions(ctx.runtime, options)
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(
      <XueqiuEditorForm
        fresh={fresh}
        sourceId={sourceId}
        settings={settings}
        ctx={ctx}
        handleRef={handleRef}
      />,
      container,
    )
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
