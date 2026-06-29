import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { loadConfigSection, validateConfig } from '../config'
import { createEditorFactory } from '../editor-helpers/createEditorFactory'
import { saveConfigSection, saveSourceSettings } from '../editor-helpers'
import { SourceSettingsFields } from '../editor-ui'
import type { SourceEditorContext, SourceEditorResult, SourceSettings } from '../types'
import {
  DEFAULT_AI_API_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_SYSTEM_PROMPT,
  type XueqiuSourceOptions,
} from './types'
import { loadAiConfig, saveAiConfig } from './ai/config'
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
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL)
  const [aiApiUrl, setAiApiUrl] = useState(DEFAULT_AI_API_URL)
  const [aiSystemPrompt, setAiSystemPrompt] = useState(DEFAULT_AI_SYSTEM_PROMPT)
  const ttlRef = useRef<HTMLInputElement>(null)
  const retentionRef = useRef<HTMLInputElement>(null)
  const aiModelRef = useRef<HTMLInputElement>(null)
  const aiApiUrlRef = useRef<HTMLInputElement>(null)
  const aiSystemPromptRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    loadAiConfig(ctx.runtime).then((cfg) => {
      if (cfg) {
        setAiModel(cfg.model)
        setAiApiUrl(cfg.apiUrl)
        setAiSystemPrompt(cfg.systemPrompt)
      }
    })
  }, [ctx.runtime])

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
            // Save AI config (model + apiUrl + systemPrompt; apiKey preserved)
            const modelVal = aiModelRef.current?.value?.trim() || DEFAULT_AI_MODEL
            const apiUrlVal = aiApiUrlRef.current?.value?.trim() || DEFAULT_AI_API_URL
            const systemPromptVal =
              aiSystemPromptRef.current?.value?.trim() || DEFAULT_AI_SYSTEM_PROMPT
            void loadAiConfig(ctx.runtime).then((existing) => {
              saveAiConfig(ctx.runtime, {
                apiKey: existing?.apiKey ?? '',
                model: modelVal,
                apiUrl: apiUrlVal,
                systemPrompt: systemPromptVal,
              })
            })
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
  }, [
    ttl,
    retentionDays,
    tabTitle,
    priority,
    badgeType,
    aiModel,
    aiApiUrl,
    aiSystemPrompt,
    ctx.runtime,
  ])

  const apiUrlNonDefault = aiApiUrl !== DEFAULT_AI_API_URL

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
      <div class="gm-sp-editor-form gm-sp-editor-form-no-border">
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
      <div class="gm-sp-editor-form gm-sp-editor-form-no-border">
        <label class="gm-sp-editor-row gm-sp-editor-row-full">
          <span>模型</span>
          <input
            ref={aiModelRef}
            type="text"
            class="gm-sp-input"
            value={aiModel}
            onInput={(e) => setAiModel((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="gm-sp-editor-row gm-sp-editor-row-full">
          <span>API URL</span>
          <input
            ref={aiApiUrlRef}
            type="text"
            class="gm-sp-input"
            value={aiApiUrl}
            onInput={(e) => setAiApiUrl((e.target as HTMLInputElement).value)}
          />
        </label>
        {apiUrlNonDefault && (
          <div class="gm-sp-editor-hint">
            ⚠️ 非 OpenRouter 地址需在脚本 metadata 中添加对应的 @connect 声明
          </div>
        )}
        <label class="gm-sp-editor-row gm-sp-editor-row-full">
          <span>System Prompt</span>
          <textarea
            ref={aiSystemPromptRef}
            class="gm-sp-input gm-sp-ai-prompt-textarea"
            value={aiSystemPrompt}
            rows={8}
            onInput={(e) => setAiSystemPrompt((e.target as HTMLTextAreaElement).value)}
          />
        </label>
        <div class="gm-sp-editor-hint">API Key 通过点击 AI 摘要视图中的「配置」按钮设置</div>
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
