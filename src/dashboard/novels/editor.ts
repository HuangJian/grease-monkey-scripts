import type { Runtime } from '../../runtime'
import { escapeHtml } from '../../utils'
import { validateConfig } from '../config'
import { CONFIG_KEY } from '../types'
import type { SourceEditor } from '../types'
import { adapterByHostname } from './adapters/registry'
import type { NovelEntry } from './types'

export type NovelsEditorOptions = {
  entries: NovelEntry[]
  ttlMinutes: number
  maxNewChaptersPerBook: number
  initialNewChapters: number
  maxLatestWindow: number
  getCachedTitles: () => Promise<Map<string, string>>
}

export function createNovelsEditor(options: NovelsEditorOptions): SourceEditor {
  return (container, ctx) => renderNovelsEditor(container, options, ctx)
}

async function loadFreshNovelsOptions(
  runtime: Runtime,
  fallback: NovelsEditorOptions,
): Promise<NovelsEditorOptions> {
  try {
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    const novels = stored?.novels as
      | {
          entries?: NovelEntry[]
          ttlMinutes?: number
          maxNewChaptersPerBook?: number
          initialNewChapters?: number
          maxLatestWindow?: number
        }
      | undefined
    if (novels) {
      return {
        entries: Array.isArray(novels.entries) ? novels.entries : fallback.entries,
        ttlMinutes: typeof novels.ttlMinutes === 'number' ? novels.ttlMinutes : fallback.ttlMinutes,
        maxNewChaptersPerBook:
          typeof novels.maxNewChaptersPerBook === 'number'
            ? novels.maxNewChaptersPerBook
            : fallback.maxNewChaptersPerBook,
        initialNewChapters:
          typeof novels.initialNewChapters === 'number'
            ? novels.initialNewChapters
            : fallback.initialNewChapters,
        maxLatestWindow:
          typeof novels.maxLatestWindow === 'number'
            ? novels.maxLatestWindow
            : fallback.maxLatestWindow,
        getCachedTitles: fallback.getCachedTitles,
      }
    }
  } catch {}
  return fallback
}

async function renderNovelsEditor(
  container: HTMLElement,
  options: NovelsEditorOptions,
  ctx: { runtime: Runtime; onRevert: () => void; close: () => void },
): Promise<void> {
  const fresh = await loadFreshNovelsOptions(ctx.runtime, options)
  const titleMap = await fresh.getCachedTitles()
  const entries: NovelEntry[] = fresh.entries.map((e) => ({ ...e }))

  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-novels-editor">
      <div class="gm-sp-novels-editor-list"></div>
      <div class="gm-sp-novels-editor-form">
        <label class="gm-sp-novels-editor-row">
          <span>书库 URL</span>
          <input type="url" class="gm-sp-ne-url" placeholder="https://www.sudugu.org/166/" />
        </label>
        <label class="gm-sp-novels-editor-row">
          <span>别名（可选）</span>
          <input type="text" class="gm-sp-ne-alias" placeholder="九龙夺嫡" />
        </label>
        <button type="button" class="gm-sp-ne-add">添加书库</button>
      </div>
      <div class="gm-sp-novels-editor-advanced">
        <label class="gm-sp-novels-editor-row">
          <span>TTL（分钟）</span>
          <input type="number" min="1" step="1" class="gm-sp-ne-ttl" />
        </label>
        <label class="gm-sp-novels-editor-row">
          <span>初始新章数</span>
          <input type="number" min="0" step="1" class="gm-sp-ne-initial" />
        </label>
        <label class="gm-sp-novels-editor-row">
          <span>折叠阈值</span>
          <input type="number" min="1" step="1" class="gm-sp-ne-fold" />
        </label>
        <label class="gm-sp-novels-editor-row">
          <span>章节窗口</span>
          <input type="number" min="1" step="1" class="gm-sp-ne-window" />
        </label>
      </div>
      <div class="gm-sp-ne-error" hidden></div>
      <div class="gm-sp-novels-editor-actions">
        <button type="button" class="gm-sp-ne-save gm-sp-primary">保存</button>
        <button type="button" class="gm-sp-ne-cancel">取消</button>
      </div>
    </div>`,
  )

  const listEl = container.querySelector('.gm-sp-novels-editor-list') as HTMLDivElement
  const urlInput = container.querySelector('.gm-sp-ne-url') as HTMLInputElement
  const aliasInput = container.querySelector('.gm-sp-ne-alias') as HTMLInputElement
  const addBtn = container.querySelector('.gm-sp-ne-add') as HTMLButtonElement
  const ttlInput = container.querySelector('.gm-sp-ne-ttl') as HTMLInputElement
  const initialInput = container.querySelector('.gm-sp-ne-initial') as HTMLInputElement
  const foldInput = container.querySelector('.gm-sp-ne-fold') as HTMLInputElement
  const windowInput = container.querySelector('.gm-sp-ne-window') as HTMLInputElement
  const errorEl = container.querySelector('.gm-sp-ne-error') as HTMLDivElement
  const saveBtn = container.querySelector('.gm-sp-ne-save') as HTMLButtonElement
  const cancelBtn = container.querySelector('.gm-sp-ne-cancel') as HTMLButtonElement

  ttlInput.value = String(fresh.ttlMinutes)
  initialInput.value = String(fresh.initialNewChapters)
  foldInput.value = String(fresh.maxNewChaptersPerBook)
  windowInput.value = String(fresh.maxLatestWindow)

  function showError(message: string): void {
    errorEl.textContent = message
    errorEl.hidden = false
  }
  function clearError(): void {
    errorEl.textContent = ''
    errorEl.hidden = true
  }

  function hostnameFor(url: string): string | null {
    try {
      return new URL(url).hostname
    } catch {
      return null
    }
  }

  function isUnknown(url: string): boolean {
    const host = hostnameFor(url)
    if (!host) return true
    return !adapterByHostname(host)
  }

  function renderList(): void {
    listEl.replaceChildren()
    if (entries.length === 0) {
      listEl.insertAdjacentHTML('beforeend', '<div class="gm-sp-ne-empty">尚未添加书库</div>')
      return
    }
    listEl.insertAdjacentHTML(
      'beforeend',
      entries
        .map((entry, i) => {
          const unknown = isUnknown(entry.url)
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
        })
        .join(''),
    )
    listEl.querySelectorAll<HTMLElement>('.gm-sp-ne-item').forEach((row) => {
      const idx = Number(row.dataset['index']!)
      const remove = row.querySelector('.gm-sp-ne-remove') as HTMLButtonElement
      remove.addEventListener('click', () => {
        entries.splice(idx, 1)
        renderList()
      })
    })
  }

  function tryAdd(): void {
    clearError()
    const url = urlInput.value.trim()
    const alias = aliasInput.value.trim()
    if (!url) {
      showError('请输入书库 URL')
      return
    }
    if (!hostnameFor(url)) {
      showError('URL 格式无效')
      return
    }
    if (entries.some((e) => e.url === url)) {
      showError('该书库已在列表中')
      return
    }
    const entry: NovelEntry = alias ? { url, alias } : { url }
    entries.push(entry)
    urlInput.value = ''
    aliasInput.value = ''
    renderList()
  }

  addBtn.addEventListener('click', tryAdd)
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      tryAdd()
    }
  })
  aliasInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      tryAdd()
    }
  })

  cancelBtn.addEventListener('click', () => {
    ctx.close()
  })

  saveBtn.addEventListener('click', () => {
    clearError()
    const ttl = Number(ttlInput.value)
    const initial = Number(initialInput.value)
    const fold = Number(foldInput.value)
    const window = Number(windowInput.value)
    if (!Number.isFinite(ttl) || ttl < 1) {
      showError('TTL 必须是 ≥1 的整数')
      return
    }
    if (!Number.isFinite(initial) || initial < 0) {
      showError('初始新章数必须是 ≥0 的整数')
      return
    }
    if (!Number.isFinite(fold) || fold < 1) {
      showError('折叠阈值必须是 ≥1 的整数')
      return
    }
    if (!Number.isFinite(window) || window < 1) {
      showError('章节窗口必须是 ≥1 的整数')
      return
    }
    const novels = {
      entries,
      ttlMinutes: Math.round(ttl),
      initialNewChapters: Math.round(initial),
      maxNewChaptersPerBook: Math.round(fold),
      maxLatestWindow: Math.round(window),
    }
    const validation = validateConfig({ novels })
    if (!validation.ok) {
      showError(validation.error)
      return
    }
    const result = ctx.runtime.getValue(CONFIG_KEY, null).then((existing) => {
      return ctx.runtime.setValue(CONFIG_KEY, { ...(existing ?? {}), novels })
    })
    Promise.resolve(result).then(() => {
      ctx.close()
    })
  })

  renderList()
}
