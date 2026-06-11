import { escapeHtml } from '../../utils'
import type { SourceEditor, SourceEditorResult } from '../types'
import { bindErrorBox, readNumberFields, saveConfigSection } from '../editor-helpers'
import { bindChipList } from '../editor-helpers'
import { validateConfig } from '../config'
import { loadConfigSection } from '../config'
import type { Runtime } from '../../runtime'
import type { TnewsSourceOptions } from './types'

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

async function loadFreshTnewsOptions(
  runtime: Runtime,
  fallback: TnewsSourceOptions,
): Promise<TnewsSourceOptions> {
  return loadConfigSection(runtime, 'tnews', fallback, (raw) => coerceTnewsOptions(raw, fallback))
}

function isValidFeedUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: '请输入 feed URL' }
  if (!URL_RE.test(trimmed)) {
    return { ok: false, error: 'feed URL 必须以 http:// 或 https:// 开头' }
  }
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
  if (!HOSTNAME_RE.test(trimmed)) {
    return { ok: false, error: '镜像 hostname 只能包含字母、数字、点和中横线' }
  }
  return { ok: true, host: trimmed }
}

async function renderTnewsEditor(
  container: HTMLElement,
  options: TnewsSourceOptions,
  ctx: { runtime: Runtime; onRevert: () => void; close: () => void },
): Promise<SourceEditorResult> {
  const fresh = await loadFreshTnewsOptions(ctx.runtime, options)
  const feeds: string[] = [...fresh.feeds]
  const mirrors: string[] = [...fresh.mirrors]

  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-editor">
      <div class="gm-sp-editor-section">
        <div class="gm-sp-editor-label">Feed URL 列表</div>
        <div class="gm-sp-tne-feeds"></div>
        <div class="gm-sp-editor-add-row">
          <input type="text" class="gm-sp-input gm-sp-tne-feed-input" placeholder="https://rsshub.app/telegram/channel/<name>" />
          <button type="button" class="gm-sp-btn gm-sp-editor-btn" data-action="add-feed">添加</button>
        </div>
      </div>
      <div class="gm-sp-editor-section">
        <div class="gm-sp-editor-label">RSSHub 镜像 hostname</div>
        <div class="gm-sp-tne-mirrors"></div>
        <div class="gm-sp-editor-add-row">
          <input type="text" class="gm-sp-input gm-sp-tne-mirror-input" placeholder="rsshub.example.com" />
          <button type="button" class="gm-sp-btn gm-sp-editor-btn" data-action="add-mirror">添加</button>
        </div>
      </div>
      <div class="gm-sp-editor-form">
        <label class="gm-sp-editor-row">
          <span>TTL（分钟）</span>
          <input type="number" min="1" step="1" class="gm-sp-input gm-sp-tne-ttl" />
        </label>
      </div>
      <div class="gm-sp-editor-error" hidden></div>
    </div>`,
  )

  const feedsEl = container.querySelector('.gm-sp-tne-feeds') as HTMLDivElement
  const feedInputEl = container.querySelector('.gm-sp-tne-feed-input') as HTMLInputElement
  const feedAddBtn = container.querySelector('[data-action="add-feed"]') as HTMLButtonElement
  const mirrorsEl = container.querySelector('.gm-sp-tne-mirrors') as HTMLDivElement
  const mirrorInputEl = container.querySelector('.gm-sp-tne-mirror-input') as HTMLInputElement
  const mirrorAddBtn = container.querySelector('[data-action="add-mirror"]') as HTMLButtonElement
  const ttlInput = container.querySelector('.gm-sp-tne-ttl') as HTMLInputElement
  const errorEl = container.querySelector('.gm-sp-editor-error') as HTMLDivElement

  ttlInput.value = String(fresh.ttlMinutes)

  const error = bindErrorBox(errorEl)

  const feedChips = bindChipList<string>({
    listEl: feedsEl,
    addBtn: feedAddBtn,
    inputs: [feedInputEl],
    getItems: () => feeds,
    setItems: (next) => {
      feeds.length = 0
      feeds.push(...next)
    },
    renderChip: (url, i) =>
      `<div class="gm-sp-editor-chip" data-index="${i}">
        <span class="gm-sp-editor-chip-label gm-sp-tne-chip-label">${escapeHtml(url)}</span>
        <button type="button" class="gm-sp-editor-chip-remove" aria-label="remove">×</button>
      </div>`,
    removeSelector: '.gm-sp-editor-chip-remove',
    tryAdd: () => {
      const r = isValidFeedUrl(feedInputEl.value)
      if (!r.ok) return { ok: false, error: r.error }
      if (feeds.includes(r.url)) return { ok: false, error: '该 URL 已在列表中' }
      return { ok: true, item: r.url }
    },
    showError: (msg) => error.show(msg),
    clearError: () => error.clear(),
    emptyText: '尚未添加 feed',
    emptyClass: 'gm-sp-editor-empty',
  })

  const mirrorChips = bindChipList<string>({
    listEl: mirrorsEl,
    addBtn: mirrorAddBtn,
    inputs: [mirrorInputEl],
    getItems: () => mirrors,
    setItems: (next) => {
      mirrors.length = 0
      mirrors.push(...next)
    },
    renderChip: (host, i) =>
      `<div class="gm-sp-editor-chip" data-index="${i}">
        <span class="gm-sp-editor-chip-label gm-sp-tne-chip-label">${escapeHtml(host)}</span>
        <button type="button" class="gm-sp-editor-chip-remove" aria-label="remove">×</button>
      </div>`,
    removeSelector: '.gm-sp-editor-chip-remove',
    tryAdd: () => {
      const r = isValidMirrorHost(mirrorInputEl.value)
      if (!r.ok) return { ok: false, error: r.error }
      if (mirrors.includes(r.host)) return { ok: false, error: '该镜像已在列表中' }
      return { ok: true, item: r.host }
    },
    showError: (msg) => error.show(msg),
    clearError: () => error.clear(),
    emptyText: '尚未添加镜像（仅对 rsshub.app 域名生效）',
    emptyClass: 'gm-sp-editor-empty',
  })

  feedChips.render()
  mirrorChips.render()

  return {
    render() {},
    cancel() {
      ctx.close()
    },
    save() {
      error.clear()
      if (feeds.length === 0) {
        error.show('至少添加一个 feed URL')
        return
      }
      const nums = readNumberFields(
        [{ input: ttlInput, min: 1, errorMessage: 'TTL 必须是 ≥1 的整数' }],
        (msg) => error.show(msg),
      )
      if (nums === null) return
      const [ttl] = nums
      const tnews = {
        feeds: [...feeds],
        mirrors: [...mirrors],
        ttlMinutes: Math.round(ttl),
      }
      void saveConfigSection({
        runtime: ctx.runtime,
        sectionKey: 'tnews',
        section: tnews,
        validate: validateConfig,
        onError: (msg) => error.show(msg),
        onSuccess: () => ctx.close(),
      })
    },
  }
}

export function createTnewsEditor(options: TnewsSourceOptions): SourceEditor {
  return (container, ctx) => renderTnewsEditor(container, options, ctx)
}

export { loadFreshTnewsOptions }
