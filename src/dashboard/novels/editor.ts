import type { Runtime } from '../../runtime'
import { escapeHtml } from '../../utils'
import { loadConfigSection, validateConfig } from '../config'
import { bindChipList, bindErrorBox, readNumberFields, saveConfigSection } from '../editor-helpers'
import type { SourceEditor, SourceEditorResult } from '../types'
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
): Promise<SourceEditorResult> {
  const fresh = await loadFreshNovelsOptions(ctx.runtime, options)
  const titleMap = await options.getCachedTitles()
  const entries: NovelEntry[] = fresh.entries.map((e) => ({ ...e }))

  const advancedFields: {
    prop: string
    label: string
    min: number
    errorMsg: string
  }[] = [
    { prop: 'ttlMinutes', label: 'TTL（分钟）', min: 1, errorMsg: 'TTL 必须是 ≥1 的整数' },
    {
      prop: 'initialNewChapters',
      label: '初始新章数',
      min: 0,
      errorMsg: '初始新章数必须是 ≥0 的整数',
    },
    {
      prop: 'maxNewChaptersPerBook',
      label: '折叠阈值',
      min: 1,
      errorMsg: '折叠阈值必须是 ≥1 的整数',
    },
    { prop: 'maxLatestWindow', label: '章节窗口', min: 1, errorMsg: '章节窗口必须是 ≥1 的整数' },
  ]

  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-editor">
      <div class="gm-sp-editor-list"></div>
      <div class="gm-sp-editor-form-stacked">
        <label class="gm-sp-editor-row">
          <span>书库 URL</span>
          <input type="url" class="gm-sp-ne-url" placeholder="https://www.sudugu.org/166/" />
        </label>
        <label class="gm-sp-editor-row">
          <span>别名（可选）</span>
          <input type="text" class="gm-sp-ne-alias" placeholder="九龙夺嫡" />
        </label>
        <button type="button" class="gm-sp-editor-btn" data-action="add">添加书库</button>
      </div>
      <div class="gm-sp-editor-advanced">
${advancedFields
  .map(
    (f) =>
      `        <label class="gm-sp-editor-row">
          <span>${f.label}</span>
          <input type="number"${f.min !== undefined ? ` min="${f.min}"` : ''} />
        </label>`,
  )
  .join('\n')}
      </div>
      <div class="gm-sp-editor-error" hidden></div>
    </div>`,
  )

  const listEl = container.querySelector('.gm-sp-editor-list') as HTMLDivElement
  const urlInput = container.querySelector('.gm-sp-ne-url') as HTMLInputElement
  const aliasInput = container.querySelector('.gm-sp-ne-alias') as HTMLInputElement
  const addBtn = container.querySelector('[data-action="add"]') as HTMLButtonElement
  const errorEl = container.querySelector('.gm-sp-editor-error') as HTMLDivElement

  const numberInputs = container.querySelectorAll<HTMLInputElement>(
    '.gm-sp-editor-advanced input[type="number"]',
  )
  for (let i = 0; i < advancedFields.length; i++) {
    numberInputs[i].value = String((fresh as Record<string, unknown>)[advancedFields[i].prop])
  }

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
      return `<div class="gm-sp-editor-item" data-index="${i}">
          <span class="gm-sp-editor-item-label">${escapeHtml(display)}</span>
          <span class="gm-sp-ne-item-url">${escapeHtml(entry.url)}</span>
          ${warnHtml}
          <button type="button" class="gm-sp-item-remove" aria-label="remove">×</button>
        </div>`
    },
    removeSelector: '.gm-sp-item-remove',
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
    emptyClass: 'gm-sp-editor-empty',
  })

  chipList.render()

  return {
    render() {},
    cancel() {
      ctx.close()
    },
    save() {
      error.clear()
      const nums = readNumberFields(
        advancedFields.map((f, i) => ({
          input: numberInputs[i],
          min: f.min,
          errorMessage: f.errorMsg,
        })),
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
    },
  }
}
