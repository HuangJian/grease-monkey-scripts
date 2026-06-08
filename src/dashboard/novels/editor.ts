import type { Runtime } from '../../runtime'
import { escapeHtml } from '../../utils'
import { loadConfigSection, validateConfig } from '../config'
import { bindChipList, bindErrorBox, readNumberFields, saveConfigSection } from '../editor-helpers'
import type { SourceEditor } from '../types'
import { adapterByHostname } from './adapters/registry'
import type { NovelEntry, NovelSourceOptions } from './types'

export type NovelsEditorOptions = NovelSourceOptions & {
  getCachedTitles: () => Promise<Map<string, string>>
}

export function createNovelsEditor(options: NovelsEditorOptions): SourceEditor {
  return (container, ctx) => renderNovelsEditor(container, options, ctx)
}

function coerceNovelsOptions(
  raw: Record<string, unknown>,
  fallback: NovelSourceOptions,
): NovelSourceOptions {
  const entries = raw['entries']
  return {
    entries: Array.isArray(entries) ? (entries as NovelEntry[]) : fallback.entries,
    ttlMinutes:
      typeof raw['ttlMinutes'] === 'number' ? (raw['ttlMinutes'] as number) : fallback.ttlMinutes,
    maxNewChaptersPerBook:
      typeof raw['maxNewChaptersPerBook'] === 'number'
        ? (raw['maxNewChaptersPerBook'] as number)
        : fallback.maxNewChaptersPerBook,
    initialNewChapters:
      typeof raw['initialNewChapters'] === 'number'
        ? (raw['initialNewChapters'] as number)
        : fallback.initialNewChapters,
    maxLatestWindow:
      typeof raw['maxLatestWindow'] === 'number'
        ? (raw['maxLatestWindow'] as number)
        : fallback.maxLatestWindow,
  }
}

async function loadFreshNovelsOptions(
  runtime: Runtime,
  fallback: NovelSourceOptions,
): Promise<NovelSourceOptions> {
  return loadConfigSection(runtime, 'novels', fallback, (raw) => coerceNovelsOptions(raw, fallback))
}

function hostnameFor(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function isUnknownHost(url: string): boolean {
  const host = hostnameFor(url)
  if (!host) return true
  return !adapterByHostname(host)
}

async function renderNovelsEditor(
  container: HTMLElement,
  options: NovelsEditorOptions,
  ctx: { runtime: Runtime; onRevert: () => void; close: () => void },
): Promise<void> {
  const fresh = await loadFreshNovelsOptions(ctx.runtime, options)
  const titleMap = await options.getCachedTitles()
  const entries: NovelEntry[] = fresh.entries.map((e) => ({ ...e }))

  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-editor">
      <div class="gm-sp-novels-editor-list"></div>
      <div class="gm-sp-novels-editor-form">
        <label class="gm-sp-editor-row">
          <span>书库 URL</span>
          <input type="url" class="gm-sp-ne-url" placeholder="https://www.sudugu.org/166/" />
        </label>
        <label class="gm-sp-editor-row">
          <span>别名（可选）</span>
          <input type="text" class="gm-sp-ne-alias" placeholder="九龙夺嫡" />
        </label>
        <button type="button" class="gm-sp-editor-btn gm-sp-ne-add">添加书库</button>
      </div>
      <div class="gm-sp-novels-editor-advanced">
        <label class="gm-sp-editor-row">
          <span>TTL（分钟）</span>
          <input type="number" min="1" step="1" class="gm-sp-ne-ttl" />
        </label>
        <label class="gm-sp-editor-row">
          <span>初始新章数</span>
          <input type="number" min="0" step="1" class="gm-sp-ne-initial" />
        </label>
        <label class="gm-sp-editor-row">
          <span>折叠阈值</span>
          <input type="number" min="1" step="1" class="gm-sp-ne-fold" />
        </label>
        <label class="gm-sp-editor-row">
          <span>章节窗口</span>
          <input type="number" min="1" step="1" class="gm-sp-ne-window" />
        </label>
      </div>
      <div class="gm-sp-ne-error" hidden></div>
      <div class="gm-sp-editor-actions">
        <button type="button" class="gm-sp-editor-btn gm-sp-editor-btn-primary gm-sp-ne-save">保存</button>
        <button type="button" class="gm-sp-editor-btn gm-sp-ne-cancel">取消</button>
      </div>
    </div>`,
  )

  const listEl = container.querySelector('.gm-sp-novels-editor-list') as HTMLDivElement
  const urlInput = container.querySelector('.gm-sp-ne-url') as HTMLInputElement
  const aliasInput = container.querySelector('.gm-sp-ne-alias') as HTMLInputElement
  const addBtn = container.querySelector('.gm-sp-editor-btn') as HTMLButtonElement
  const ttlInput = container.querySelector('.gm-sp-ne-ttl') as HTMLInputElement
  const initialInput = container.querySelector('.gm-sp-ne-initial') as HTMLInputElement
  const foldInput = container.querySelector('.gm-sp-ne-fold') as HTMLInputElement
  const windowInput = container.querySelector('.gm-sp-ne-window') as HTMLInputElement
  const errorEl = container.querySelector('.gm-sp-ne-error') as HTMLDivElement
  const saveBtn = container.querySelector(
    '.gm-sp-editor-btn.gm-sp-editor-btn-primary',
  ) as HTMLButtonElement
  const cancelBtn = container.querySelector('.gm-sp-ne-cancel') as HTMLButtonElement

  ttlInput.value = String(fresh.ttlMinutes)
  initialInput.value = String(fresh.initialNewChapters)
  foldInput.value = String(fresh.maxNewChaptersPerBook)
  windowInput.value = String(fresh.maxLatestWindow)

  const error = bindErrorBox(errorEl)

  const chipList = bindChipList<NovelEntry>({
    listEl,
    addBtn,
    inputs: [urlInput, aliasInput],
    getItems: () => entries,
    setItems: (next) => {
      entries.length = 0
      entries.push(...next)
    },
    renderChip: (entry, i) => {
      const unknown = isUnknownHost(entry.url)
      const title = titleMap.get(entry.url)
      const display = entry.alias || title || entry.url
      const warnHtml = unknown
        ? '<span class="gm-sp-ne-item-warn">未知站点</span>'
        : '<span class="gm-sp-ne-item-warn" hidden>未知站点</span>'
      return `<div class="gm-sp-ne-item" data-index="${i}">
          <span class="gm-sp-ne-item-label">${escapeHtml(display)}</span>
          <span class="gm-sp-ne-item-url">${escapeHtml(entry.url)}</span>
          ${warnHtml}
          <button type="button" class="gm-sp-ne-remove" aria-label="remove">×</button>
        </div>`
    },
    removeSelector: '.gm-sp-ne-remove',
    tryAdd: () => {
      const url = urlInput.value.trim()
      const alias = aliasInput.value.trim()
      if (!url) return { ok: false, error: '请输入书库 URL' }
      if (!hostnameFor(url)) return { ok: false, error: 'URL 格式无效' }
      if (entries.some((e) => e.url === url)) {
        return { ok: false, error: '该书库已在列表中' }
      }
      const entry: NovelEntry = alias ? { url, alias } : { url }
      return { ok: true, item: entry }
    },
    showError: (msg) => error.show(msg),
    clearError: () => error.clear(),
    emptyText: '尚未添加书库',
    emptyClass: 'gm-sp-ne-empty',
  })

  cancelBtn.addEventListener('click', () => {
    ctx.close()
  })

  saveBtn.addEventListener('click', () => {
    error.clear()
    const nums = readNumberFields(
      [
        { input: ttlInput, min: 1, errorMessage: 'TTL 必须是 ≥1 的整数' },
        { input: initialInput, min: 0, errorMessage: '初始新章数必须是 ≥0 的整数' },
        { input: foldInput, min: 1, errorMessage: '折叠阈值必须是 ≥1 的整数' },
        { input: windowInput, min: 1, errorMessage: '章节窗口必须是 ≥1 的整数' },
      ],
      (msg) => error.show(msg),
    )
    if (nums === null) return
    const [ttl, initial, fold, window] = nums
    const novels = {
      entries,
      ttlMinutes: Math.round(ttl),
      initialNewChapters: Math.round(initial),
      maxNewChaptersPerBook: Math.round(fold),
      maxLatestWindow: Math.round(window),
    }
    void saveConfigSection({
      runtime: ctx.runtime,
      sectionKey: 'novels',
      section: novels,
      validate: validateConfig,
      onError: (msg) => error.show(msg),
      onSuccess: () => ctx.close(),
    })
  })

  chipList.render()
}
