import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { loadConfigSection, validateConfig } from '../config'
import { readNumberFields, saveConfigSection, saveSourceSettings } from '../editor-helpers'
import { SourceSettingsFields, ChipList } from '../editor-ui'
import type {
  SourceEditor,
  SourceEditorContext,
  SourceEditorResult,
  SourceSettings,
} from '../types'
import type { TnewsSourceOptions } from './types'
import type { Runtime } from '../../runtime'

const URL_RE = /^https?:\/\//i
const HOSTNAME_RE = /^[a-z0-9.-]+$/i

function coerceTnewsOptions(
  raw: Record<string, unknown>,
  fallback: TnewsSourceOptions,
): TnewsSourceOptions {
  const feeds = Array.isArray(raw['feeds'])
    ? (raw['feeds'] as unknown[]).map((u) => String(u)).filter((u) => u.length > 0)
    : fallback.feeds
  const mirrors = Array.isArray(raw['mirrors'])
    ? (raw['mirrors'] as unknown[]).map((m) => String(m)).filter((m) => m.length > 0)
    : fallback.mirrors
  return {
    feeds: feeds.length > 0 ? feeds : fallback.feeds,
    mirrors,
    ttlMinutes:
      typeof raw['ttlMinutes'] === 'number' && Number.isFinite(raw['ttlMinutes'])
        ? (raw['ttlMinutes'] as number)
        : fallback.ttlMinutes,
  }
}

async function loadFreshOptions(
  runtime: Runtime,
  fallback: TnewsSourceOptions,
): Promise<TnewsSourceOptions> {
  return loadConfigSection(runtime, 'tnews', fallback, (raw) => coerceTnewsOptions(raw, fallback))
}

function isValidFeedUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: '请输入 feed URL' }
  if (!URL_RE.test(trimmed)) return { ok: false, error: 'feed URL 必须以 http:// 或 https:// 开头' }
  try {
    void new URL(trimmed)
  } catch {
    return { ok: false, error: 'feed URL 不是合法 URL' }
  }
  return { ok: true, url: trimmed }
}

function isValidMirrorHost(raw: string): { ok: true; host: string } | { ok: false; error: string } {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return { ok: false, error: '请输入镜像 hostname' }
  if (!HOSTNAME_RE.test(trimmed))
    return { ok: false, error: '镜像 hostname 只能包含字母、数字、点和中横线' }
  return { ok: true, host: trimmed }
}

type TnewsEditorFormProps = {
  fresh: TnewsSourceOptions
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function TnewsEditorForm({ fresh, settings, ctx, handleRef }: TnewsEditorFormProps) {
  const [feeds, setFeeds] = useState<string[]>(() => [...fresh.feeds])
  const [mirrors, setMirrors] = useState<string[]>(() => [...fresh.mirrors])
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
        if (feeds.length === 0) {
          setError('至少添加一个 feed URL')
          return
        }
        const nums = readNumberFields(
          [{ input: ttlRef.current!, min: 1, errorMessage: 'TTL 必须是 ≥1 的整数' }],
          (msg) => setError(msg),
        )
        if (nums === null) return
        const tnews: TnewsSourceOptions = {
          feeds: [...feeds],
          mirrors: [...mirrors],
          ttlMinutes: Math.round(nums[0]),
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'tnews',
          section: tnews,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'tnews', { tabTitle, priority, badgeType })
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [feeds, mirrors, ttl, tabTitle, priority, badgeType])

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
      <ChipList
        sectionLabel="Feed URL 列表"
        items={feeds}
        emptyMessage="尚未添加 feed"
        addInputPlaceholder="https://rsshub.app/telegram/channel/<name>"
        addButtonDataAction="add-feed"
        listClassName="gm-sp-tne-feeds"
        onRemove={(i) => setFeeds((prev) => prev.filter((_, j) => j !== i))}
        onAdd={(raw) => {
          const r = isValidFeedUrl(raw)
          if (!r.ok) return r.error
          if (feeds.includes(r.url)) return '该 URL 已在列表中'
          setFeeds((prev) => [...prev, r.url])
          return null
        }}
        onError={setError}
      />
      <ChipList
        sectionLabel="RSSHub 镜像 hostname"
        items={mirrors}
        emptyMessage="尚未添加镜像（仅对 rsshub.app 域名生效）"
        addInputPlaceholder="rsshub.example.com"
        addButtonDataAction="add-mirror"
        listClassName="gm-sp-tne-mirrors"
        chipLabelClass="gm-sp-tne-chip-label"
        onRemove={(i) => setMirrors((prev) => prev.filter((_, j) => j !== i))}
        onAdd={(raw) => {
          const r = isValidMirrorHost(raw)
          if (!r.ok) return r.error
          if (mirrors.includes(r.host)) return '该镜像已在列表中'
          setMirrors((prev) => [...prev, r.host])
          return null
        }}
        onError={setError}
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

export function createTnewsEditor(
  options: TnewsSourceOptions,
  settings: SourceSettings,
): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshOptions(ctx.runtime, options)
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(
      <TnewsEditorForm fresh={fresh} settings={settings} ctx={ctx} handleRef={handleRef} />,
      container,
    )
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}

export { loadFreshOptions as loadFreshTnewsOptions }
