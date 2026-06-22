import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { loadConfigSection, validateConfig } from '../config'
import { createEditorFactory } from '../editor-helpers/createEditorFactory'
import { saveConfigSection, saveSourceSettings } from '../editor-helpers'
import { SourceSettingsFields } from '../editor-ui'
import type { SourceEditorContext, SourceEditorResult, SourceSettings } from '../types'
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
    retentionDays:
      typeof raw['retentionDays'] === 'number' && Number.isFinite(raw['retentionDays'])
        ? (raw['retentionDays'] as number)
        : fallback.retentionDays,
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
  const [retentionDays, setRetentionDays] = useState(fresh.retentionDays)
  const [tabTitle, setTabTitle] = useState(settings.tabTitle)
  const [priority, setPriority] = useState(settings.priority)
  const [badgeType, setBadgeType] = useState(settings.badgeType)
  const ttlRef = useRef<HTMLInputElement>(null)
  const retentionRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      save() {
        setError('')
        const ttlVal = ttlRef.current?.value
        const ttlNum = ttlVal !== undefined ? Number(ttlVal) : NaN
        if (!Number.isFinite(ttlNum) || ttlNum < 1 || Math.round(ttlNum) !== ttlNum) {
          setError('TTL 必须是 ≥1 的整数')
          return
        }
        const retentionVal = retentionRef.current?.value
        const retentionNum = retentionVal !== undefined ? Number(retentionVal) : NaN
        if (!Number.isFinite(retentionNum) || retentionNum < 1 || retentionNum > 90) {
          setError('数据保留必须是 1~90 之间的整数')
          return
        }
        const xueqiu: XueqiuSourceOptions = {
          ttlMinutes: ttlNum,
          retentionDays: Math.round(retentionNum),
        }
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
  }, [ttl, retentionDays, tabTitle, priority, badgeType])

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
        <label class="gm-sp-editor-row">
          <span>数据保留（天）</span>
          <input
            ref={retentionRef}
            type="number"
            min="1"
            max="90"
            step="1"
            class="gm-sp-input"
            value={retentionDays}
            onInput={(e) => setRetentionDays(Number((e.target as HTMLInputElement).value))}
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
) {
  return createEditorFactory(
    (runtime) => loadFreshOptions(runtime, options),
    XueqiuEditorForm,
    (fresh) => ({ fresh, sourceId, settings }),
  )
}
