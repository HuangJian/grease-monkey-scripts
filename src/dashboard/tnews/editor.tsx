import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { escapeHtml } from '../../utils'
import { loadConfigSection, validateConfig } from '../config'
import { readNumberFields, saveConfigSection } from '../editor-helpers'
import type { SourceEditor, SourceEditorContext, SourceEditorResult } from '../types'
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
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function TnewsEditorForm({ fresh, ctx, handleRef }: TnewsEditorFormProps) {
  const [feeds, setFeeds] = useState<string[]>(() => [...fresh.feeds])
  const [mirrors, setMirrors] = useState<string[]>(() => [...fresh.mirrors])
  const [error, setError] = useState('')
  const [ttl, setTtl] = useState(fresh.ttlMinutes)
  const feedRef = useRef<HTMLInputElement>(null)
  const mirrorRef = useRef<HTMLInputElement>(null)
  const ttlRef = useRef<HTMLInputElement>(null)

  const addFeed = useCallback(() => {
    setError('')
    const val = feedRef.current?.value ?? ''
    const r = isValidFeedUrl(val)
    if (!r.ok) {
      setError(r.error)
      return
    }
    if (feeds.includes(r.url)) {
      setError('该 URL 已在列表中')
      return
    }
    setFeeds((prev) => [...prev, r.url])
    if (feedRef.current) feedRef.current.value = ''
  }, [feeds])

  const addMirror = useCallback(() => {
    setError('')
    const val = mirrorRef.current?.value ?? ''
    const r = isValidMirrorHost(val)
    if (!r.ok) {
      setError(r.error)
      return
    }
    if (mirrors.includes(r.host)) {
      setError('该镜像已在列表中')
      return
    }
    setMirrors((prev) => [...prev, r.host])
    if (mirrorRef.current) mirrorRef.current.value = ''
  }, [mirrors])

  const onFeedKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        addFeed()
      }
    },
    [addFeed],
  )

  const onMirrorKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        addMirror()
      }
    },
    [addMirror],
  )

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
          onSuccess: () => ctx.close(),
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [feeds, mirrors, ttl])

  return (
    <div class="gm-sp-editor">
      <div class="gm-sp-editor-section">
        <div class="gm-sp-editor-label">Feed URL 列表</div>
        <div class="gm-sp-tne-feeds">
          {feeds.length === 0 ? (
            <div class="gm-sp-editor-empty">尚未添加 feed</div>
          ) : (
            feeds.map((url, i) => (
              <div class="gm-sp-editor-chip" key={i}>
                <span class="gm-sp-editor-chip-label gm-sp-tne-chip-label">{escapeHtml(url)}</span>
                <button
                  type="button"
                  class="gm-sp-editor-chip-remove"
                  aria-label="remove"
                  onClick={() => setFeeds((prev) => prev.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
        <div class="gm-sp-editor-add-row">
          <input
            ref={feedRef}
            type="text"
            class="gm-sp-input gm-sp-tne-feed-input"
            placeholder="https://rsshub.app/telegram/channel/<name>"
            onKeyDown={onFeedKeyDown}
          />
          <button
            type="button"
            class="gm-sp-btn gm-sp-editor-btn"
            data-action="add-feed"
            onClick={addFeed}
          >
            添加
          </button>
        </div>
      </div>
      <div class="gm-sp-editor-section">
        <div class="gm-sp-editor-label">RSSHub 镜像 hostname</div>
        <div class="gm-sp-tne-mirrors">
          {mirrors.length === 0 ? (
            <div class="gm-sp-editor-empty">尚未添加镜像（仅对 rsshub.app 域名生效）</div>
          ) : (
            mirrors.map((host, i) => (
              <div class="gm-sp-editor-chip" key={i}>
                <span class="gm-sp-editor-chip-label gm-sp-tne-chip-label">{escapeHtml(host)}</span>
                <button
                  type="button"
                  class="gm-sp-editor-chip-remove"
                  aria-label="remove"
                  onClick={() => setMirrors((prev) => prev.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
        <div class="gm-sp-editor-add-row">
          <input
            ref={mirrorRef}
            type="text"
            class="gm-sp-input gm-sp-tne-mirror-input"
            placeholder="rsshub.example.com"
            onKeyDown={onMirrorKeyDown}
          />
          <button
            type="button"
            class="gm-sp-btn gm-sp-editor-btn"
            data-action="add-mirror"
            onClick={addMirror}
          >
            添加
          </button>
        </div>
      </div>
      <div class="gm-sp-editor-form">
        <label class="gm-sp-editor-row">
          <span>TTL（分钟）</span>
          <input
            ref={ttlRef}
            type="number"
            min="1"
            step="1"
            class="gm-sp-input gm-sp-tne-ttl"
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

export function createTnewsEditor(options: TnewsSourceOptions): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshOptions(ctx.runtime, options)
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(<TnewsEditorForm fresh={fresh} ctx={ctx} handleRef={handleRef} />, container)
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}

export { loadFreshOptions as loadFreshTnewsOptions }
